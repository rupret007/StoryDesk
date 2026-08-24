import type {
  AgentEvent,
  AgentRunSnapshot,
  AgentSettings,
  AgentToolResult,
  AppSettings,
  CastDevice,
  DisplayEvent,
  DisplaySource,
  RuntimeRequest,
  RuntimeState,
  Session,
  VirtualDisplayConfig
} from "./types";

declare global {
  interface Window {
    storyDesk: {
      display: {
        start(config: VirtualDisplayConfig): Promise<void>;
        stop(): Promise<void>;
        onEvent(callback: (event: DisplayEvent) => void): () => void;
      };
      sources: {
        list(): Promise<DisplaySource[]>;
      };
      session: {
        get(): Promise<Session>;
      };
      receiver: {
        openUrl(url: string): Promise<void>;
        resetFallbackStream(token: string): Promise<void>;
        publishFallbackFrame(token: string, frame: ArrayBuffer): void;
      };
      cast: {
        discover(): Promise<CastDevice[]>;
        connect(deviceId: string): Promise<void>;
        disconnect(): Promise<void>;
        resetStream(token: string): Promise<void>;
        publishChunk(token: string, chunk: ArrayBuffer): void;
      };
      settings: {
        get(): Promise<AppSettings>;
        set(settings: AppSettings): Promise<AppSettings>;
      };
      agent: {
        getSettings(): Promise<AgentSettings>;
        setSettings(settings: AgentSettings): Promise<AgentSettings>;
        getSnapshot(): Promise<AgentRunSnapshot>;
        startGoal(prompt: string, mode: "assist" | "autonomous"): Promise<AgentRunSnapshot>;
        approve(): Promise<AgentRunSnapshot>;
        stop(): Promise<AgentRunSnapshot>;
        onEvent(callback: (event: AgentEvent) => void): () => void;
      };
      runtime: {
        onRequest(
          callback: (request: RuntimeRequest) => Promise<RuntimeState | AgentToolResult>
        ): () => void;
        publishState(state: RuntimeState): void;
      };
      permissions: {
        openScreenRecording(): Promise<void>;
      };
    };
  }
}
