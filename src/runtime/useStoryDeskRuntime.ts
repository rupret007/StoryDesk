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
  const streamGenerationRef = useRef(0);
  const hostTokenRef = useRef("");

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
    storyDeskRef.current.runtime.publishState(runtimeState);
  }, [runtimeState]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const updateRuntime = useCallback((updater: (state: RuntimeState) => RuntimeState) => {
    const next = updater(runtimeStateRef.current);
    runtimeStateRef.current = next;
    setRuntimeState(next);
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
      addLog("info", "Creating virtual display");
      await storyDeskRef.current.display.start(config);
      await waitForDisplayStatus(runtimeStateRef, "ready");
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
    streamGenerationRef.current += 1;
    const session = runtimeStateRef.current.session;
    castRecorderRef.current.stop();
    fallbackPublisherRef.current.stop();
    signalingRef.current?.stop();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const cleanupResults = await Promise.allSettled([
      storyDeskRef.current.cast.disconnect(),
      ...(session
        ? [
            storyDeskRef.current.cast.resetStream(session.token),
            storyDeskRef.current.receiver.resetFallbackStream(session.token)
          ]
        : [])
    ]);
    const cleanupFailure = cleanupResults.find((result) => result.status === "rejected");
    if (cleanupFailure?.status === "rejected") {
      addLog("warn", `Stream cleanup was incomplete: ${String(cleanupFailure.reason)}`);
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
      },
      cast: { ...state.cast, status: "idle" }
    }));
  }, [addLog, updateRuntime]);

  const stopDisplay = useCallback(async () => {
    await stopStream();
    await storyDeskRef.current.display.stop();
    await waitForDisplayStatus(runtimeStateRef, "offline");
  }, [stopStream]);

  const startStream = useCallback(async () => {
    const state = runtimeStateRef.current;
    const session = state.session;
    const hostToken = hostTokenRef.current;
    if (!session || !hostToken) {
      throw new Error("Local server is not ready");
    }
    const generation = ++streamGenerationRef.current;

    updateRuntime((current) => ({
      ...current,
      stream: { ...current.stream, status: "starting", lastError: undefined },
      receiver: { ...current.receiver, status: "waiting", url: session.receiverUrl }
    }));

    try {
      let sources = state.sources;
      let source = sources.find((item) => item.id === state.stream.sourceId);
      if (!source) {
        sources = await refreshSources();
        if (generation !== streamGenerationRef.current) {
          return;
        }
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

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (generation !== streamGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (localStreamRef.current === stream) {
          addLog("warn", "Screen capture ended");
          void stopStream();
        }
      }, { once: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      signalingRef.current?.start(stream, session, hostToken);
      await fallbackPublisherRef.current.start(stream, session, streamSettings);
      if (generation !== streamGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (localStreamRef.current === stream) {
          localStreamRef.current = null;
        }
        return;
      }
      try {
        await castRecorderRef.current.start(stream, session, streamSettings);
      } catch (error) {
        addLog("warn", `Cast stream recorder unavailable: ${String(error)}`);
      }
      if (generation !== streamGenerationRef.current) {
        castRecorderRef.current.stop();
        stream.getTracks().forEach((track) => track.stop());
        if (localStreamRef.current === stream) {
          localStreamRef.current = null;
        }
        return;
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
      if (generation !== streamGenerationRef.current) {
        return;
      }
      await stopStream();
      const message = `Unable to start stream: ${errorMessage(error)}`;
      addLog("error", message);
      updateRuntime((current) => ({
        ...current,
        stream: {
          ...current.stream,
          status: "error",
          startedAt: undefined,
          lastError: message
        },
        receiver: {
          ...current.receiver,
          status: "error",
          connectedCount: 0,
          lastError: message
        },
        permissions: isPermissionDeniedError(error) ? {
          ...current.permissions,
          screenRecording: "denied"
        } : current.permissions
      }));
      throw error;
    }
  }, [addLog, refreshSources, stopStream, updateRuntime]);

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
      if (
        runtimeStateRef.current.stream.status === "live" ||
        runtimeStateRef.current.stream.status === "starting"
      ) {
        void stopStream();
      }
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
  }, [addLog, refreshSources, stopStream, updateRuntime]);

  useEffect(() => {
    if (!desktopAvailableRef.current && !previewNoticeLogged) {
      previewNoticeLogged = true;
      addLog("warn", "Browser preview mode: open the Electron app for virtual display controls.");
    }

    void storyDeskRef.current.settings.get().then((nextSettings) => {
      setSettings(nextSettings);
      settingsRef.current = nextSettings;
      updateRuntime((state) => ({
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
    void storyDeskRef.current.session.get().then(({ hostToken, ...session }) => {
      hostTokenRef.current = hostToken;
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

async function waitForDisplayStatus(
  stateRef: { current: RuntimeState },
  expected: RuntimeState["display"]["status"],
  timeoutMs = 10_000
) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const display = stateRef.current.display;
    if (display.status === expected) {
      return;
    }
    if (display.status === "error") {
      throw new Error(display.lastError ?? "Virtual display failed");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for virtual display to become ${expected}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isPermissionDeniedError(error: unknown) {
  return error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError");
}
