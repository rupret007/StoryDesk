/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAgentSettings, defaultAppSettings } from "../shared/runtimeState";
import { getStoryDeskBridge, hasDesktopBridge } from "../src/runtime/desktopBridge";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser preview bridge", () => {
  it("provides a preview session without advertising desktop or streaming support", async () => {
    expect(hasDesktopBridge()).toBe(false);
    const bridge = getStoryDeskBridge();
    expect(await bridge.session.get()).toMatchObject({
      status: "error",
      receiverUrl: window.location.href,
      tvUrl: window.location.href,
      joinUrl: window.location.href,
      fallbackUrl: window.location.href,
      joinCode: "PREVIEW",
      castUrl: "",
      wsUrl: ""
    });
    expect(await bridge.sources.list()).toEqual([]);
    expect(await bridge.cast.discover()).toEqual([]);
  });

  it("rejects desktop-only actions instead of claiming they succeeded", async () => {
    const bridge = getStoryDeskBridge();
    const message = "Desktop controls are available in the StoryDesk Electron app.";
    await expect(bridge.display.start(defaultAppSettings.display)).rejects.toThrow(message);
    await expect(bridge.cast.connect("preview-device")).rejects.toThrow(message);
    await expect(bridge.agent.startGoal("Start a display", "assist")).rejects.toThrow(message);
    expect(await bridge.agent.getSnapshot()).toEqual({ status: "idle", transcript: [] });
  });

  it("opens the receiver without granting access to the preview window", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const receiverUrl = "http://localhost:3210/receiver";
    await getStoryDeskBridge().receiver.openUrl(receiverUrl);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(receiverUrl, "_blank", "noopener,noreferrer");
  });

  it("returns edited settings without changing the shared preview defaults", async () => {
    const bridge = getStoryDeskBridge();
    const settings = {
      ...defaultAppSettings,
      display: { ...defaultAppSettings.display, width: 1280, height: 720 }
    };
    const agentSettings = { ...defaultAgentSettings, model: "preview-model", maxAutonomousSteps: 2 };
    expect(await bridge.settings.set(settings)).toEqual(settings);
    expect(await bridge.agent.setSettings(agentSettings)).toEqual(agentSettings);
    expect(await bridge.settings.get()).toEqual(defaultAppSettings);
    expect(await bridge.agent.getSettings()).toEqual(defaultAgentSettings);
    expect(defaultAppSettings.display.width).toBe(1920);
    expect(defaultAgentSettings.maxAutonomousSteps).toBe(6);
  });

  it("allows repeated cleanup when desktop resources were never started", async () => {
    const bridge = getStoryDeskBridge();
    const onDisplay = vi.fn();
    const onAgent = vi.fn();
    const onRequest = vi.fn();
    const unsubscribe = [
      bridge.display.onEvent(onDisplay),
      bridge.agent.onEvent(onAgent),
      bridge.runtime.onRequest(onRequest)
    ];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      unsubscribe.forEach((off) => off());
      await expect(bridge.display.stop()).resolves.toBeUndefined();
      await expect(bridge.cast.disconnect()).resolves.toBeUndefined();
      await expect(bridge.cast.resetStream("browser-preview")).resolves.toBeUndefined();
      await expect(bridge.receiver.resetFallbackStream("browser-preview")).resolves.toBeUndefined();
      expect(await bridge.agent.approve()).toEqual({ status: "idle", transcript: [] });
      expect(await bridge.agent.stop()).toEqual({ status: "idle", transcript: [] });
    }
    expect(onDisplay).not.toHaveBeenCalled();
    expect(onAgent).not.toHaveBeenCalled();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("uses the injected desktop bridge when Electron supplies one", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const desktopBridge = {
      ...getStoryDeskBridge(),
      display: { ...getStoryDeskBridge().display, start }
    };
    vi.stubGlobal("storyDesk", desktopBridge);
    expect(hasDesktopBridge()).toBe(true);
    expect(getStoryDeskBridge()).toBe(desktopBridge);
    await getStoryDeskBridge().display.start(defaultAppSettings.display);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(defaultAppSettings.display);
  });
});
