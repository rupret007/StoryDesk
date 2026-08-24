import type { AppSettings, RuntimeState, Session } from "./types";

export const defaultAppSettings: AppSettings = {
  display: { width: 1920, height: 1080, fps: 30, hidpi: true },
  stream: { width: 1920, height: 1080, fps: 30, bitrateKbps: 6500 }
};

export const defaultAgentSettings = {
  provider: "local" as const,
  endpoint: "",
  apiKey: "",
  model: "gpt-4.1-mini",
  approvalMode: "manual" as const,
  maxAutonomousSteps: 6
};

export function createInitialRuntimeState(
  settings: AppSettings = defaultAppSettings,
  session?: Session
): RuntimeState {
  const now = new Date().toISOString();
  return {
    display: {
      status: "offline",
      config: settings.display
    },
    stream: {
      status: "idle",
      settings: settings.stream
    },
    receiver: {
      status: "offline",
      url: session?.receiverUrl,
      connectedCount: 0
    },
    cast: {
      status: "idle",
      devices: []
    },
    permissions: {
      screenRecording: "unknown"
    },
    diagnostics: {
      logs: [],
      lastUpdatedAt: now
    },
    session,
    sources: []
  };
}
