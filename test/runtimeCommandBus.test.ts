import { describe, expect, it } from "vitest";
import { RuntimeCommandBus } from "../electron/lib/runtimeCommandBus";
import { createInitialRuntimeState } from "../shared/runtimeState";

describe("RuntimeCommandBus", () => {
  it("routes request and response messages", async () => {
    const handlers = new Map<string, Function>();
    const state = createInitialRuntimeState();
    const fakeIpcMain = {
      on(channel: string, handler: Function) {
        handlers.set(channel, handler);
      }
    };
    const fakeWebContents = {
      isDestroyed: () => false,
      send: (_channel: string, request: { id: string }) => {
        queueMicrotask(() => {
          handlers.get("runtime:response")?.({}, { id: request.id, ok: true, data: state });
        });
      }
    };

    const bus = new RuntimeCommandBus(() => fakeWebContents as never);
    bus.bind(fakeIpcMain as never);

    await expect(bus.requestState()).resolves.toEqual(state);
  });

  it("caches state-change messages", () => {
    const handlers = new Map<string, Function>();
    const fakeIpcMain = {
      on(channel: string, handler: Function) {
        handlers.set(channel, handler);
      }
    };
    const state = createInitialRuntimeState();
    const bus = new RuntimeCommandBus(() => null);
    bus.bind(fakeIpcMain as never);

    handlers.get("runtime:state-changed")?.({}, state);

    expect(bus.getCachedState()).toEqual(state);
  });
});
