import { useCallback, useEffect, useRef, useState } from "react";
import { defaultAgentSettings, defaultAppSettings, createInitialRuntimeState } from "../../shared/runtimeState";
import type {
  AgentEvent,
  AgentRunSnapshot,
  AgentSettings,
  AgentToolCall,
  AgentToolResult,
  AppSettings,
  DisplayEvent,
  RuntimeReceiverState,
  RuntimeRequest,
  RuntimeState,
  StreamSettings,
  VirtualDisplayConfig
} from "../types";
import { CastRecorderService } from "./castRecorder";
import { getStoryDeskBridge, hasDesktopBridge } from "./desktopBridge";
import { FallbackFramePublisherService } from "./fallbackFramePublisher";
import { ReceiverSignalingService } from "./receiverSignaling";

export type RuntimeLogEntry = {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
};

const emptyAgentSnapshot: AgentRunSnapshot = {
  status: "idle",
  transcript: []
};

let previewNoticeLogged = false;

export function useStoryDeskRuntime() {
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(defaultAgentSettings);
  const [agentSnapshot, setAgentSnapshot] = useState<AgentRunSnapshot>(emptyAgentSnapshot);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>(
    createInitialRuntimeState(defaultAppSettings)
  );
  const [logs, setLogs] = useState<RuntimeLogEntry[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const storyDeskRef = useRef(getStoryDeskBridge());
  const desktopAvailableRef = useRef(hasDesktopBridge());
  const localStreamRef = useRef<MediaStream | null>(null);
  const castRecorderRef = useRef(new CastRecorderService());
  const fallbackPublisherRef = useRef(new FallbackFramePublisherService());
  const signalingRef = useRef<ReceiverSignalingService | null>(null);
  const runtimeStateRef = useRef(runtimeState);
  const settingsRef = useRef(settings);
  const logIdRef = useRef(0);

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
    storyDeskRef.current.runtime.publishState(runtimeState);
  }, [runtimeState]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const updateRuntime = useCallback((updater: (state: RuntimeState) => RuntimeState) => {
    setRuntimeState((current) => updater(current));
  }, []);

  const addLog = useCallback(
    (level: RuntimeLogEntry["level"], message: string) => {
      const at = new Date().toISOString();
      const entry = { id: ++logIdRef.current, level, message, at };
      setLogs((current) => [entry, ...current.slice(0, 7)]);
      updateRuntime((state) => ({
        ...state,
        diagnostics: {
          logs: [
            { level, message, at },
            ...state.diagnostics.logs.slice(0, 24)
          ],
          lastUpdatedAt: at
        }
      }));
    },
    [updateRuntime]
  );

  const updateReceiver = useCallback(
    (patch: Partial<RuntimeReceiverState>) => {
      updateRuntime((state) => ({
        ...state,
        receiver: {
          ...state.receiver,
          ...patch
        }
      }));
    },
    [updateRuntime]
  );

  useEffect(() => {
    signalingRef.current = new ReceiverSignalingService({
      onLog: addLog,
      onReceiverState: updateReceiver
    });
    return () => signalingRef.current?.stop();
  }, [addLog, updateReceiver]);

  const persistSettings = useCallback(async (next: AppSettings) => {
    setSettings(next);
    settingsRef.current = next;
    updateRuntime((state) => ({
      ...state,
      display: { ...state.display, config: next.display },
      stream: { ...state.stream, settings: next.stream }
    }));
    await storyDeskRef.current.settings.set(next);
  }, [updateRuntime]);

  const persistAgentSettings = useCallback(async (next: AgentSettings) => {
    setAgentSettings(next);
    await storyDeskRef.current.agent.setSettings(next);
  }, []);

  const refreshSources = useCallback(async () => {
    const nextSources = await storyDeskRef.current.sources.list();
    const displayId = runtimeStateRef.current.display.displayId;
    const currentSourceId = runtimeStateRef.current.stream.sourceId;
    const match =
      nextSources.find((source) => source.name.toLowerCase().includes("storydesk")) ??
      (displayId
        ? nextSources.find((source) => source.displayId === String(displayId))
        : undefined) ??
      nextSources.find((source) => source.id === currentSourceId);

    updateRuntime((state) => ({
      ...state,
      sources: nextSources,
      stream: {
        ...state.stream,
        sourceId: match?.id ?? state.stream.sourceId
      }
    }));
    return nextSources;
  }, [updateRuntime]);

  const startDisplay = useCallback(async () => {
    const config = settingsRef.current.display;
    updateRuntime((state) => ({
      ...state,
      display: { ...state.display, status: "starting", config, lastError: undefined }
    }));
    try {
      if (!desktopAvailableRef.current) {
        throw new Error("Open StoryDesk in the Electron app to create a virtual display.");
      }
      await storyDeskRef.current.display.start(config);
      addLog("info", "Creating virtual display");
    } catch (error) {
      const message = String(error);
      addLog("error", message);
      updateRuntime((state) => ({
        ...state,
        display: { ...state.display, status: "error", lastError: message }
      }));
      throw error;
    }
  }, [addLog, updateRuntime]);

  const stopStream = useCallback(async () => {
    castRecorderRef.current.stop();
    fallbackPublisherRef.current.stop();
    signalingRef.current?.stop();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    updateRuntime((state) => ({
      ...state,
      stream: { ...state.stream, status: "idle", startedAt: undefined },
      receiver: {
        ...state.receiver,
        status: "offline",
        connectedCount: 0,
        latencyMs: undefined,
        bitrateKbps: undefined,
        frameRate: undefined
      }
    }));
  }, [updateRuntime]);

  const stopDisplay = useCallback(async () => {
    await stopStream();
    await storyDeskRef.current.display.stop();
  }, [stopStream]);

  const startStream = useCallback(async () => {
    const state = runtimeStateRef.current;
    const session = state.session;
    if (!session) {
      throw new Error("Local server is not ready");
    }

    updateRuntime((current) => ({
      ...current,
      stream: { ...current.stream, status: "starting", lastError: undefined },
      receiver: { ...current.receiver, status: "waiting", url: session.receiverUrl }
    }));

    let sources = state.sources;
    let source = sources.find((item) => item.id === state.stream.sourceId);
    if (!source) {
      sources = await refreshSources();
      const updatedState = runtimeStateRef.current;
      source =
        sources.find((item) => item.id === updatedState.stream.sourceId) ??
        sources.find((item) => item.name.toLowerCase().includes("storydesk"));
    }
    if (!source) {
      throw new Error("Virtual display source not found");
    }

    const streamSettings = settingsRef.current.stream;
    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: source.id,
          minWidth: streamSettings.width,
          maxWidth: streamSettings.width,
          minHeight: streamSettings.height,
          maxHeight: streamSettings.height,
          maxFrameRate: streamSettings.fps
        }
      }
    } as MediaStreamConstraints;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      signalingRef.current?.start(stream, session);
      await fallbackPublisherRef.current.start(stream, session, streamSettings);
      try {
        await castRecorderRef.current.start(stream, session, streamSettings);
      } catch (error) {
        addLog("warn", `Cast stream recorder unavailable: ${String(error)}`);
      }
      updateRuntime((current) => ({
        ...current,
        stream: {
          ...current.stream,
          status: "live",
          sourceId: source.id,
          settings: streamSettings,
          startedAt: new Date().toISOString()
        },
        receiver: {
          ...current.receiver,
          status: "waiting",
          url: session.receiverUrl,
          frameRate: streamSettings.fps,
          bitrateKbps: streamSettings.bitrateKbps
        }
      }));
      addLog("info", "Stream started");
    } catch (error) {
      const message = `Screen capture failed: ${String(error)}`;
      addLog("error", message);
      updateRuntime((current) => ({
        ...current,
        stream: { ...current.stream, status: "error", lastError: message },
        permissions: { ...current.permissions, screenRecording: "denied" }
      }));
      throw error;
    }
  }, [addLog, refreshSources, updateRuntime]);

  const discoverCastDevices = useCallback(async () => {
    updateRuntime((state) => ({
      ...state,
      cast: { ...state.cast, status: "scanning", lastError: undefined }
    }));
    try {
      const devices = await storyDeskRef.current.cast.discover();
      updateRuntime((state) => ({
        ...state,
        cast: {
          ...state.cast,
          status: "idle",
          devices,
          selectedDeviceId: state.cast.selectedDeviceId ?? devices[0]?.id
        }
      }));
      addLog("info", `${devices.length} Cast device${devices.length === 1 ? "" : "s"}`);
      return devices;
    } catch (error) {
      const message = String(error);
      updateRuntime((state) => ({
        ...state,
        cast: { ...state.cast, status: "error", lastError: message }
      }));
      throw error;
    }
  }, [addLog, updateRuntime]);

  const connectCast = useCallback(async () => {
    const selectedDeviceId = runtimeStateRef.current.cast.selectedDeviceId;
    if (!selectedDeviceId) {
      throw new Error("No Cast device selected");
    }
    await storyDeskRef.current.cast.connect(selectedDeviceId);
    updateRuntime((state) => ({
      ...state,
      cast: { ...state.cast, status: "connected" }
    }));
    addLog("info", "Cast session started");
  }, [addLog, updateRuntime]);

  const disconnectCast = useCallback(async () => {
    await storyDeskRef.current.cast.disconnect();
    updateRuntime((state) => ({
      ...state,
      cast: { ...state.cast, status: "idle" }
    }));
    addLog("warn", "Cast session stopped");
  }, [addLog, updateRuntime]);

  const copyReceiverUrl = useCallback(async () => {
    const url = runtimeStateRef.current.session?.receiverUrl;
    if (url) {
      await navigator.clipboard.writeText(url);
      addLog("info", "Receiver URL copied");
    }
  }, [addLog]);

  const copyTvUrl = useCallback(async () => {
    const session = runtimeStateRef.current.session;
    if (session) {
      await navigator.clipboard.writeText(
        `${session.tvUrl}  Code: ${session.joinCode}\nCompatibility: ${session.joinUrl}?mode=fallback`
      );
      addLog("info", "TV join details copied");
    }
  }, [addLog]);

  const openReceiverUrl = useCallback(async () => {
    const url = runtimeStateRef.current.session?.receiverUrl;
    if (!url) {
      throw new Error("Receiver URL is not ready");
    }
    await storyDeskRef.current.receiver.openUrl(url);
    addLog("info", "Receiver URL opened");
  }, [addLog]);

  const openTvUrl = useCallback(async () => {
    const url = runtimeStateRef.current.session?.tvUrl;
    if (!url) {
      throw new Error("TV join URL is not ready");
    }
    await storyDeskRef.current.receiver.openUrl(url);
    addLog("info", "TV join page opened");
  }, [addLog]);

  const openFallbackUrl = useCallback(async () => {
    const url = runtimeStateRef.current.session?.fallbackUrl;
    if (!url) {
      throw new Error("Compatibility receiver URL is not ready");
    }
    await storyDeskRef.current.receiver.openUrl(url);
    addLog("info", "Compatibility receiver opened");
  }, [addLog]);

  const executeTool = useCallback(
    async (toolCall: AgentToolCall): Promise<AgentToolResult> => {
      try {
        let data: unknown;
        switch (toolCall.tool) {
          case "startVirtualDisplay":
            await startDisplay();
            data = runtimeStateRef.current.display;
            break;
          case "stopVirtualDisplay":
            await stopDisplay();
            data = runtimeStateRef.current.display;
            break;
          case "refreshSources":
            data = await refreshSources();
            break;
          case "startBrowserStream":
            await startStream();
            data = runtimeStateRef.current.stream;
            break;
          case "stopStream":
            await stopStream();
            data = runtimeStateRef.current.stream;
            break;
          case "openReceiverUrl":
            await openReceiverUrl();
            data = runtimeStateRef.current.session?.receiverUrl;
            break;
          case "scanCastDevices":
            data = await discoverCastDevices();
            break;
          case "collectDiagnostics":
            data = runtimeStateRef.current;
            break;
          default:
            throw new Error(`Unknown tool: ${toolCall.tool}`);
        }
        return { id: toolCall.id, ok: true, data };
      } catch (error) {
        return {
          id: toolCall.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    [
      discoverCastDevices,
      openReceiverUrl,
      refreshSources,
      startDisplay,
      startStream,
      stopDisplay,
      stopStream
    ]
  );

  const executeToolRef = useRef(executeTool);
  useEffect(() => {
    executeToolRef.current = executeTool;
  }, [executeTool]);

  const handleRuntimeRequest = useCallback(async (request: RuntimeRequest) => {
    if (request.type === "runtime:getState") {
      return runtimeStateRef.current;
    }
    if (request.type === "runtime:executeTool") {
      return executeToolRef.current(request.toolCall);
    }
    throw new Error("Unknown runtime request");
  }, []);

  const handleDisplayEvent = useCallback((event: DisplayEvent) => {
    if (event.type === "ready") {
      updateRuntime((state) => ({
        ...state,
        display: {
          status: "ready",
          displayId: event.displayID,
          config: {
            width: event.width,
            height: event.height,
            fps: event.fps,
            hidpi: event.hidpi
          }
        },
        permissions: { ...state.permissions, screenRecording: "unknown" }
      }));
      addLog("info", `Display ready: ${event.width}x${event.height}`);
      void refreshSources();
    }
    if (event.type === "stopped" || event.type === "terminated") {
      updateRuntime((state) => ({
        ...state,
        display: {
          ...state.display,
          status: "offline",
          displayId: undefined
        },
        sources: []
      }));
      addLog("warn", "Virtual display stopped");
    }
    if (event.type === "error") {
      updateRuntime((state) => ({
        ...state,
        display: { ...state.display, status: "error", lastError: event.message }
      }));
      addLog("error", event.message);
    }
  }, [addLog, refreshSources, updateRuntime]);

  useEffect(() => {
    if (!desktopAvailableRef.current && !previewNoticeLogged) {
      previewNoticeLogged = true;
      addLog("warn", "Browser preview mode: open the Electron app for virtual display controls.");
    }

    void storyDeskRef.current.settings.get().then((nextSettings) => {
      setSettings(nextSettings);
      settingsRef.current = nextSettings;
      setRuntimeState((state) => ({
        ...createInitialRuntimeState(nextSettings, state.session),
        diagnostics: state.diagnostics
      }));
    });
    void storyDeskRef.current.agent.getSettings().then(setAgentSettings);
    void storyDeskRef.current.agent.getSnapshot().then((snapshot) => {
      if (snapshot) {
        setAgentSnapshot(snapshot);
      }
    });
    void storyDeskRef.current.session.get().then((session) => {
      updateRuntime((state) => ({
        ...state,
        session,
        receiver: {
          ...state.receiver,
          url: session.receiverUrl
        }
      }));
    });

    const offDisplay = storyDeskRef.current.display.onEvent((event) => {
      handleDisplayEvent(event);
    });
    const offAgent = storyDeskRef.current.agent.onEvent((event) => {
      setAgentEvents((current) => [event, ...current.slice(0, 30)]);
      void storyDeskRef.current.agent.getSnapshot().then((snapshot) => {
        if (snapshot) {
          setAgentSnapshot(snapshot);
        }
      });
    });
    const offRuntime = storyDeskRef.current.runtime.onRequest(handleRuntimeRequest);
    return () => {
      offDisplay();
      offAgent();
      offRuntime();
    };
  }, [addLog, handleDisplayEvent, handleRuntimeRequest, updateRuntime]);

  const updateDisplay = useCallback(
    (patch: Partial<VirtualDisplayConfig>) => {
      void persistSettings({
        ...settingsRef.current,
        display: { ...settingsRef.current.display, ...patch }
      });
    },
    [persistSettings]
  );

  const updateStream = useCallback(
    (patch: Partial<StreamSettings>) => {
      void persistSettings({
        ...settingsRef.current,
        stream: { ...settingsRef.current.stream, ...patch }
      });
    },
    [persistSettings]
  );

  const setSelectedSourceId = useCallback((sourceId: string) => {
    updateRuntime((state) => ({
      ...state,
      stream: { ...state.stream, sourceId }
    }));
  }, [updateRuntime]);

  const setSelectedDeviceId = useCallback((deviceId: string) => {
    updateRuntime((state) => ({
      ...state,
      cast: { ...state.cast, selectedDeviceId: deviceId }
    }));
  }, [updateRuntime]);

  const startAgentGoal = useCallback(async (prompt: string) => {
    const snapshot = await storyDeskRef.current.agent.startGoal(prompt, "assist");
    setAgentSnapshot(snapshot);
  }, []);

  const approveAgentTool = useCallback(async () => {
    const snapshot = await storyDeskRef.current.agent.approve();
    setAgentSnapshot(snapshot);
  }, []);

  const stopAgent = useCallback(async () => {
    const snapshot = await storyDeskRef.current.agent.stop();
    setAgentSnapshot(snapshot);
  }, []);

  return {
    runtimeState,
    settings,
    agentSettings,
    agentSnapshot,
    agentEvents,
    logs,
    desktopAvailable: desktopAvailableRef.current,
    videoRef,
    actions: {
      startDisplay,
      stopDisplay,
      refreshSources,
      startStream,
      stopStream,
      discoverCastDevices,
      connectCast,
      disconnectCast,
      copyReceiverUrl,
      copyTvUrl,
      openReceiverUrl,
      openTvUrl,
      openFallbackUrl,
      updateDisplay,
      updateStream,
      setSelectedSourceId,
      setSelectedDeviceId,
      persistAgentSettings,
      startAgentGoal,
      approveAgentTool,
      stopAgent
    }
  };
}
