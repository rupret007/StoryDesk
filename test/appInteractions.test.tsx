/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { createInitialRuntimeState, defaultAgentSettings, defaultAppSettings } from "../shared/runtimeState";
import type { AgentToolCall, Session } from "../shared/types";
import type { useStoryDeskRuntime } from "../src/runtime/useStoryDeskRuntime";

type Runtime = ReturnType<typeof useStoryDeskRuntime>;
const { runtimeHook } = vi.hoisted(() => ({ runtimeHook: vi.fn<() => Runtime>() }));

vi.mock("../src/runtime/useStoryDeskRuntime", () => ({ useStoryDeskRuntime: runtimeHook }));

const session: Session = {
  token: "test-session",
  receiverUrl: "http://localhost:4242/r/test-session",
  tvUrl: "http://localhost:4242/tv",
  joinCode: "ABC123",
  joinUrl: "http://localhost:4242/tv?code=ABC123",
  fallbackUrl: "http://localhost:4242/fallback/test-session",
  castUrl: "http://localhost:4242/cast/test-session",
  wsUrl: "ws://localhost:4242/ws",
  status: "ready"
};

const pendingTool: AgentToolCall = {
  id: "display-start",
  tool: "startVirtualDisplay",
  args: {},
  requiresApproval: true,
  reason: "Create a display for this session"
};

describe("desktop controls", () => {
  let container: HTMLDivElement;
  let root: Root;
  let runtime: Runtime;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    const settings = structuredClone(defaultAppSettings);
    runtime = {
      runtimeState: createInitialRuntimeState(settings, session),
      settings,
      agentSettings: { ...defaultAgentSettings },
      agentSnapshot: { status: "idle", transcript: [] },
      agentEvents: [],
      logs: [],
      desktopAvailable: true,
      videoRef: { current: null },
      actions: {
        startDisplay: vi.fn(async () => {}),
        stopDisplay: vi.fn(async () => {}),
        refreshSources: vi.fn(async () => []),
        startStream: vi.fn(async () => {}),
        stopStream: vi.fn(async () => {}),
        discoverCastDevices: vi.fn(async () => []),
        connectCast: vi.fn(async () => {}),
        disconnectCast: vi.fn(async () => {}),
        copyReceiverUrl: vi.fn(async () => {}),
        copyTvUrl: vi.fn(async () => {}),
        openReceiverUrl: vi.fn(async () => {}),
        openTvUrl: vi.fn(async () => {}),
        openFallbackUrl: vi.fn(async () => {}),
        updateDisplay: vi.fn(),
        updateStream: vi.fn(),
        setSelectedSourceId: vi.fn(),
        setSelectedDeviceId: vi.fn(),
        persistAgentSettings: vi.fn(async () => {}),
        startAgentGoal: vi.fn(async () => {}),
        approveAgentTool: vi.fn(async () => {}),
        stopAgent: vi.fn(async () => {})
      }
    };
    runtimeHook.mockReturnValue(runtime);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render() {
    await act(async () => root.render(<App />));
  }

  function control<T extends HTMLElement>(label: string): T {
    const element = container.querySelector<T>(`[aria-label="${label}"]`);
    expect(element, label).not.toBeNull();
    return element!;
  }

  async function click(label: string) {
    await act(async () => control<HTMLButtonElement>(label).click());
  }

  async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
    const prototype = element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
  }

  function inputInLabel(text: string): HTMLInputElement {
    const label = [...container.querySelectorAll("label")].find((item) => item.textContent?.trim() === text);
    expect(label, text).toBeTruthy();
    return label!.querySelector("input")!;
  }

  it("sends source and display/stream settings changes to the runtime", async () => {
    runtime.runtimeState.sources = [
      { id: "screen:1", name: "StoryDesk display", displayId: "1" },
      { id: "screen:2", name: "Other display", displayId: "2" }
    ];
    runtime.runtimeState.stream.sourceId = "screen:1";
    runtime.runtimeState.display.status = "ready";
    await render();

    expect(container.querySelector(".empty-state")?.textContent).toBe("StoryDesk display");
    expect(control("Virtual display 1920 by 1080").getAttribute("aria-pressed")).toBe("true");
    await change(control<HTMLSelectElement>("Capture source"), "screen:2");
    await click("Refresh sources");
    await click("Virtual display 1280 by 720");
    await act(async () => inputInLabel("HiDPI").click());
    await change(inputInLabel("FPS"), "60");
    await change(inputInLabel("Bitrate"), "8000");

    expect(runtime.actions.setSelectedSourceId).toHaveBeenCalledWith("screen:2");
    expect(runtime.actions.refreshSources).toHaveBeenCalledOnce();
    expect(runtime.actions.updateDisplay).toHaveBeenNthCalledWith(1, { width: 1280, height: 720 });
    expect(runtime.actions.updateDisplay).toHaveBeenNthCalledWith(2, { hidpi: false });
    expect(runtime.actions.updateStream).toHaveBeenNthCalledWith(1, { fps: 60 });
    expect(runtime.actions.updateStream).toHaveBeenNthCalledWith(2, { bitrateKbps: 8000 });
  });

  it("gates start/stop controls through display and stream transitions", async () => {
    await render();
    expect(control<HTMLButtonElement>("Stop virtual display").disabled).toBe(true);
    expect(control<HTMLButtonElement>("Start stream").disabled).toBe(true);
    await click("Start virtual display");
    expect(runtime.actions.startDisplay).toHaveBeenCalledOnce();

    runtime.runtimeState.display.status = "starting";
    await render();
    expect(control<HTMLButtonElement>("Start virtual display").disabled).toBe(true);
    runtime.runtimeState.display.status = "ready";
    await render();
    expect(control<HTMLButtonElement>("Start virtual display").disabled).toBe(true);
    expect(control<HTMLButtonElement>("Start stream").disabled).toBe(false);
    await click("Start stream");
    expect(runtime.actions.startStream).toHaveBeenCalledOnce();

    runtime.runtimeState.stream.status = "starting";
    await render();
    expect(control<HTMLButtonElement>("Start stream").disabled).toBe(true);
    expect(control<HTMLButtonElement>("Stop stream").disabled).toBe(false);
    runtime.runtimeState.stream.status = "live";
    await render();
    expect(container.querySelector(".empty-state")).toBeNull();
    expect(control("Display on")).toBeTruthy();
    expect(control("Stream on")).toBeTruthy();
    await click("Stop stream");
    await click("Stop virtual display");
    expect(runtime.actions.stopStream).toHaveBeenCalledOnce();
    expect(runtime.actions.stopDisplay).toHaveBeenCalledOnce();

    runtime.desktopAvailable = false;
    await render();
    for (const label of ["Start virtual display", "Stop virtual display", "Start stream", "Stop stream", "Scan Chromecast devices", "Run Autopilot"]) {
      expect(control<HTMLButtonElement>(label).disabled, label).toBe(true);
    }
    expect(inputInLabel("FPS").disabled).toBe(true);
    expect(inputInLabel("HiDPI").disabled).toBe(true);
  });

  it("routes receiver actions and shows session and receiver details", async () => {
    runtime.runtimeState.receiver = { status: "connected", connectedCount: 2, latencyMs: 15, frameRate: 29 };
    await render();

    expect(control("TV join code").textContent).toBe("ABC123");
    expect(container.querySelector(".tv-url")?.textContent).toBe(session.tvUrl);
    expect(container.querySelector(".metrics-row")?.textContent).toBe("2 receiver15 ms29 fps");
    expect(control("Receiver on")).toBeTruthy();
    await click("Copy receiver URL");
    await click("Open receiver URL");
    await click("Copy TV join details");
    await click("Open TV join page");
    await click("Open compatibility receiver");
    expect(runtime.actions.copyReceiverUrl).toHaveBeenCalledOnce();
    expect(runtime.actions.openReceiverUrl).toHaveBeenCalledOnce();
    expect(runtime.actions.copyTvUrl).toHaveBeenCalledOnce();
    expect(runtime.actions.openTvUrl).toHaveBeenCalledOnce();
    expect(runtime.actions.openFallbackUrl).toHaveBeenCalledOnce();

    runtime.runtimeState.session = undefined;
    await render();
    expect(container.querySelector('[aria-label="Copy receiver URL"]')).toBeNull();
    expect(container.querySelector('[aria-label="TV join code"]')).toBeNull();
    expect(container.querySelector(".topbar p")?.textContent).toBe("Starting local server");
  });

  it("requires a live stream and selected device before starting Chromecast", async () => {
    runtime.runtimeState.cast.devices = [
      { id: "living-room", name: "Living room", model: "Chromecast", host: "127.0.0.1", port: 8009 },
      { id: "office", name: "Office", model: "", host: "127.0.0.2", port: 8009 }
    ];
    await render();
    expect(control<HTMLButtonElement>("Start Chromecast").disabled).toBe(true);
    expect(control<HTMLSelectElement>("Chromecast device").textContent).toContain("Living room (Chromecast)");
    await click("Scan Chromecast devices");
    await change(control<HTMLSelectElement>("Chromecast device"), "office");
    expect(runtime.actions.discoverCastDevices).toHaveBeenCalledOnce();
    expect(runtime.actions.setSelectedDeviceId).toHaveBeenCalledWith("office");

    runtime.runtimeState.cast.selectedDeviceId = "office";
    await render();
    expect(control<HTMLButtonElement>("Start Chromecast").disabled).toBe(true);
    runtime.runtimeState.stream.status = "live";
    await render();
    expect(control<HTMLButtonElement>("Start Chromecast").disabled).toBe(false);
    await click("Start Chromecast");
    expect(runtime.actions.connectCast).toHaveBeenCalledOnce();
    runtime.runtimeState.cast.status = "connected";
    await render();
    expect(control<HTMLButtonElement>("Start Chromecast").disabled).toBe(true);
    expect(control("Cast on")).toBeTruthy();
    await click("End Chromecast");
    expect(runtime.actions.disconnectCast).toHaveBeenCalledOnce();
  });

  it("preserves agent settings and routes goal, approval, and stop actions", async () => {
    await render();
    expect(control<HTMLButtonElement>("Stop Autopilot").disabled).toBe(true);
    expect(control<HTMLButtonElement>("Approve Autopilot tool").disabled).toBe(true);
    await change(control<HTMLInputElement>("Autopilot goal"), "Prepare the living room receiver");
    await change(control<HTMLSelectElement>("Autopilot provider"), "openai-compatible");
    await change(control<HTMLSelectElement>("Approval mode"), "trusted");
    expect(runtime.actions.persistAgentSettings).toHaveBeenNthCalledWith(1, {
      ...defaultAgentSettings, provider: "openai-compatible"
    });
    expect(runtime.actions.persistAgentSettings).toHaveBeenNthCalledWith(2, {
      ...defaultAgentSettings, approvalMode: "trusted"
    });
    await click("Run Autopilot");
    expect(runtime.actions.startAgentGoal).toHaveBeenCalledWith("Prepare the living room receiver");

    runtime.agentSnapshot.status = "running";
    await render();
    expect(control<HTMLButtonElement>("Run Autopilot").disabled).toBe(true);
    runtime.agentSnapshot = { status: "waiting-approval", pendingToolCall: pendingTool, transcript: [] };
    await render();
    expect(container.querySelector(".approval-card")?.textContent).toContain("Create a display for this session");
    await click("Approve Autopilot tool");
    await click("Stop Autopilot");
    expect(runtime.actions.approveAgentTool).toHaveBeenCalledOnce();
    expect(runtime.actions.stopAgent).toHaveBeenCalledOnce();

    runtime.agentSnapshot.pendingToolCall = { ...pendingTool, reason: undefined };
    await render();
    expect(container.querySelector(".approval-card")?.textContent).toContain("Approval required");
  });

  it("shows the latest agent outcomes and runtime log severity", async () => {
    runtime.agentEvents = [
      { type: "message", level: "info", message: "Preparing receiver" },
      { type: "approval-required", toolCall: pendingTool },
      { type: "tool-result", result: { id: "display-start", ok: true } },
      { type: "tool-result", result: { id: "stream-start", ok: false, error: "Permission denied" } },
      { type: "state", state: "waiting-approval" },
      { type: "complete", summary: "Receiver ready" },
      { type: "message", level: "info", message: "Older hidden event" }
    ];
    runtime.logs = [{ id: 1, level: "warn", message: "Receiver disconnected", at: "2026-01-01T00:00:00Z" }];
    await render();
    const eventTexts = () => [...container.querySelectorAll(".transcript-list span")].map((item) => item.textContent);
    expect(eventTexts()).toEqual([
      "Preparing receiver", "Approval needed: startVirtualDisplay", "display-start: ok",
      "stream-start: Permission denied", "State: waiting-approval", "Receiver ready"
    ]);
    expect(container.querySelector(".log-item.warn")?.textContent).toBe("Receiver disconnected");

    runtime.agentEvents = [
      { type: "error", message: "Display unavailable" },
      { type: "tool-proposed", toolCall: pendingTool },
      { type: "started", goal: { id: "goal-1", prompt: "Prepare receiver", mode: "assist", createdAt: "2026-01-01T00:00:00Z" } }
    ];
    await render();
    expect(eventTexts()).toEqual(["Display unavailable", "Proposed: startVirtualDisplay", "started"]);
  });
});
