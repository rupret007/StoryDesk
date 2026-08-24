import { describe, expect, it } from "vitest";
import { createInitialRuntimeState, defaultAppSettings } from "../shared/runtimeState";

describe("createInitialRuntimeState", () => {
  it("builds a browser-first idle snapshot", () => {
    const state = createInitialRuntimeState(defaultAppSettings, {
      token: "abc",
      receiverUrl: "http://127.0.0.1/r/abc",
      tvUrl: "http://127.0.0.1/tv",
      joinCode: "FIRE42",
      joinUrl: "http://127.0.0.1/go/FIRE42",
      fallbackUrl: "http://127.0.0.1/fallback/abc",
      castUrl: "http://127.0.0.1/cast/abc/live.webm",
      wsUrl: "ws://127.0.0.1/ws",
      status: "ready"
    });

    expect(state.display.status).toBe("offline");
    expect(state.stream.status).toBe("idle");
    expect(state.receiver.url).toBe("http://127.0.0.1/r/abc");
    expect(state.cast.devices).toEqual([]);
  });
});
