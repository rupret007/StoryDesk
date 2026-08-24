export type VirtualDisplayConfig = {
  width: number;
  height: number;
  fps: number;
  hidpi: boolean;
};

export type StreamSettings = {
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
};

export type CastDevice = {
  id: string;
  name: string;
  host: string;
  port: number;
  model: string;
};

export type Session = {
  token: string;
  receiverUrl: string;
  tvUrl: string;
  joinCode: string;
  joinUrl: string;
  fallbackUrl: string;
  castUrl: string;
  wsUrl: string;
  status: "ready" | "error";
};

export type DisplaySource = {
  id: string;
  name: string;
  displayId: string;
  thumbnailDataUrl?: string;
};

export type DisplayEvent =
  | {
      type: "ready";
      displayID: number;
      width: number;
      height: number;
      fps: number;
      hidpi: boolean;
    }
  | { type: "stopped" }
  | { type: "terminated"; displayID?: number; code?: number | null }
  | { type: "error"; message: string };

export type AppSettings = {
  display: VirtualDisplayConfig;
  stream: StreamSettings;
};

export type AgentProviderKind = "local" | "openai-compatible";

export type AgentApprovalMode = "manual" | "trusted";

export type AgentSettings = {
  provider: AgentProviderKind;
  endpoint: string;
  apiKey: string;
  model: string;
  approvalMode: AgentApprovalMode;
  maxAutonomousSteps: number;
};

export type AgentGoal = {
  id: string;
  prompt: string;
  mode: "assist" | "autonomous";
  createdAt: string;
};

export type AgentToolName =
  | "startVirtualDisplay"
  | "stopVirtualDisplay"
  | "refreshSources"
  | "startBrowserStream"
  | "stopStream"
  | "openReceiverUrl"
  | "scanCastDevices"
  | "collectDiagnostics";

export type AgentToolCall = {
  id: string;
  tool: AgentToolName;
  args: Record<string, unknown>;
  requiresApproval: boolean;
  reason?: string;
};

export type AgentToolResult = {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
};

export type RuntimeDisplayState = {
  status: "offline" | "starting" | "ready" | "error";
  displayId?: number;
  config: VirtualDisplayConfig;
  lastError?: string;
};

export type RuntimeStreamState = {
  status: "idle" | "starting" | "live" | "error";
  sourceId?: string;
  startedAt?: string;
  settings: StreamSettings;
  lastError?: string;
};

export type RuntimeReceiverState = {
  status: "offline" | "waiting" | "connected" | "reconnecting" | "error";
  url?: string;
  connectedCount: number;
  latencyMs?: number;
  bitrateKbps?: number;
  frameRate?: number;
  lastSeenAt?: string;
  lastError?: string;
};

export type RuntimeCastState = {
  status: "idle" | "scanning" | "connected" | "error";
  devices: CastDevice[];
  selectedDeviceId?: string;
  lastError?: string;
};

export type RuntimePermissionsState = {
  screenRecording: "unknown" | "granted" | "denied";
};

export type RuntimeDiagnosticsState = {
  logs: Array<{
    level: "info" | "warn" | "error";
    message: string;
    at: string;
  }>;
  lastUpdatedAt: string;
};

export type RuntimeState = {
  display: RuntimeDisplayState;
  stream: RuntimeStreamState;
  receiver: RuntimeReceiverState;
  cast: RuntimeCastState;
  permissions: RuntimePermissionsState;
  diagnostics: RuntimeDiagnosticsState;
  session?: Session;
  sources: DisplaySource[];
};

export type RuntimeRequest =
  | { id: string; type: "runtime:getState" }
  | { id: string; type: "runtime:executeTool"; toolCall: AgentToolCall };

export type RuntimeResponse =
  | { id: string; ok: true; data: RuntimeState | AgentToolResult }
  | { id: string; ok: false; error: string };

export type AgentEvent =
  | { type: "started"; goal: AgentGoal }
  | { type: "message"; level: "info" | "warn" | "error"; message: string }
  | { type: "tool-proposed"; toolCall: AgentToolCall }
  | { type: "approval-required"; toolCall: AgentToolCall }
  | { type: "tool-result"; result: AgentToolResult }
  | { type: "state"; state: "idle" | "running" | "waiting-approval" | "stopped" | "complete" | "error" }
  | { type: "complete"; summary: string }
  | { type: "error"; message: string };

export type AgentRunSnapshot = {
  status: "idle" | "running" | "waiting-approval" | "stopped" | "complete" | "error";
  goal?: AgentGoal;
  pendingToolCall?: AgentToolCall;
  transcript: Array<{
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    at: string;
  }>;
};
