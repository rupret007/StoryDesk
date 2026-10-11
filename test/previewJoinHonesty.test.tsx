/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defaultAgentSettings, defaultAppSettings } from "../shared/runtimeState";
import type { DesktopSession } from "../src/types";
import App from "../src/App";

const liveSession: DesktopSession = {
  token: "abc123",
  hostToken: "host456",
  receiverUrl: "http://192.168.1.10:48000/r/abc123",
  tvUrl: "http://192.168.1.10:48000/tv",
  joinCode: "FIRE42",
  joinUrl: "http://192.168.1.10:48000/go/FIRE42",
  fallbackUrl: "http://192.168.1.10:48000/fallback/abc123",
  castUrl: "http://192.168.1.10:48000/cast/abc123/live.webm",
  wsUrl: "ws://192.168.1.10:48000/ws",
  status: "ready"
};

describe("preview join honesty", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Reflect.deleteProperty(window, "storyDesk");
  });

  it("hides the fake PREVIEW QR, code, and join actions when the desktop bridge is missing", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    const notes = [...container.querySelectorAll(".join-preview-note")];
    expect(notes).toHaveLength(2);
    expect(notes.every((note) => note.textContent === "Join link appears in the Electron app")).toBe(true);

    expect(qrTitle(container)).toBeNull();
    expect(container.querySelector(".tv-code")).toBeNull();
    expect(container.querySelector(".tv-url")).toBeNull();
    expect(container.textContent).not.toContain("PREVIEW");

    expect(container.querySelector('[aria-label="Copy receiver URL"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open receiver URL"]')).toBeNull();
    expect(container.querySelector('[aria-label="Copy TV join details"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open TV join page"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open compatibility receiver"]')).toBeNull();
    expect(enabledButtonNamed(container, "Copy")).toBeNull();
    expect(enabledButtonNamed(container, "Open")).toBeNull();
    expect(enabledButtonNamed(container, "Compat")).toBeNull();
  });

  it("still shows the real LAN QR and six-character code when the desktop bridge is present", async () => {
    installDesktopBridge(liveSession);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    expect(container.querySelector(".join-preview-note")).toBeNull();
    expect(qrTitle(container)?.textContent).toBe("Receiver URL QR code");
    expect(container.querySelector(".tv-code")?.textContent).toBe("FIRE42");
    expect(container.querySelector(".tv-url")?.textContent).toBe("http://192.168.1.10:48000/tv");
    expect(container.querySelector('[aria-label="Copy receiver URL"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Open receiver URL"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Copy TV join details"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Open TV join page"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Open compatibility receiver"]')).toBeTruthy();
    expect(container.textContent).not.toContain("PREVIEW");
    expect(container.textContent).not.toContain("Join link appears in the Electron app");
  });
});

function qrTitle(container: HTMLElement) {
  return [...container.querySelectorAll("title")].find((node) => node.textContent === "Receiver URL QR code") ?? null;
}

function enabledButtonNamed(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.replace(/\s+/g, " ").trim() === label && !button.disabled
  ) ?? null;
}

function installDesktopBridge(session: DesktopSession) {
  window.storyDesk = {
    display: {
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(),
      onEvent: () => () => undefined
    },
    sources: {
      list: () => Promise.resolve([])
    },
    session: {
      get: () => Promise.resolve(session)
    },
    receiver: {
      openUrl: () => Promise.resolve(),
      resetFallbackStream: () => Promise.resolve(),
      publishFallbackFrame: () => undefined
    },
    cast: {
      discover: () => Promise.resolve([]),
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
      resetStream: () => Promise.resolve(),
      publishChunk: () => undefined
    },
    settings: {
      get: () => Promise.resolve(defaultAppSettings),
      set: (next) => Promise.resolve(next)
    },
    agent: {
      getSettings: () => Promise.resolve(defaultAgentSettings),
      setSettings: (next) => Promise.resolve(next),
      getSnapshot: () => Promise.resolve({ status: "idle", transcript: [] }),
      startGoal: () => Promise.resolve({ status: "idle", transcript: [] }),
      approve: () => Promise.resolve({ status: "idle", transcript: [] }),
      stop: () => Promise.resolve({ status: "idle", transcript: [] }),
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
}
