import { defaultAgentSettings, defaultAppSettings } from "../../shared/runtimeState";
import type { AgentRunSnapshot, Session } from "../types";

export type StoryDeskBridge = Window["storyDesk"];

const previewAgentSnapshot: AgentRunSnapshot = {
  status: "idle",
  transcript: []
};

export function hasDesktopBridge() {
  return Boolean((window as Window & { storyDesk?: StoryDeskBridge }).storyDesk);
}

export function getStoryDeskBridge(): StoryDeskBridge {
  return (window as Window & { storyDesk?: StoryDeskBridge }).storyDesk ?? browserPreviewBridge;
}

const browserPreviewBridge: StoryDeskBridge = {
  display: {
    start: () => Promise.reject(desktopOnlyError()),
    stop: () => Promise.resolve(),
    onEvent: () => () => undefined
  },
  sources: {
    list: () => Promise.resolve([])
  },
  session: {
    get: () => Promise.resolve(createPreviewSession())
  },
  receiver: {
    openUrl: (url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
      return Promise.resolve();
    },
    resetFallbackStream: () => Promise.resolve(),
    publishFallbackFrame: () => undefined
  },
  cast: {
    discover: () => Promise.resolve([]),
    connect: () => Promise.reject(desktopOnlyError()),
    disconnect: () => Promise.resolve(),
    resetStream: () => Promise.resolve(),
    publishChunk: () => undefined
  },
  settings: {
    get: () => Promise.resolve(defaultAppSettings),
    set: (settings) => Promise.resolve(settings)
  },
  agent: {
    getSettings: () => Promise.resolve(defaultAgentSettings),
    setSettings: (settings) => Promise.resolve(settings),
    getSnapshot: () => Promise.resolve(previewAgentSnapshot),
    startGoal: () => Promise.reject(desktopOnlyError()),
    approve: () => Promise.resolve(previewAgentSnapshot),
    stop: () => Promise.resolve(previewAgentSnapshot),
    onEvent: () => () => undefined
  },
  runtime: {
    onRequest: () => () => undefined,
    publishState: () => undefined
  },
  permissions: {
    openScreenRecording: () => Promise.resolve()
  }
};

function createPreviewSession(): Session {
  return {
    token: "browser-preview",
    receiverUrl: window.location.href,
    tvUrl: window.location.href,
    joinCode: "PREVIEW",
    joinUrl: window.location.href,
    fallbackUrl: window.location.href,
    castUrl: "",
    wsUrl: "",
    status: "error"
  };
}

function desktopOnlyError() {
  return new Error("Desktop controls are available in the StoryDesk Electron app.");
}
