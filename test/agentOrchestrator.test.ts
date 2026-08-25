import { describe, expect, it } from "vitest";
import { AgentOrchestrator } from "../electron/agent/agentOrchestrator";
import type { RuntimeCommandBus } from "../electron/lib/runtimeCommandBus";
import { createInitialRuntimeState, defaultAgentSettings, defaultAppSettings } from "../shared/runtimeState";
import type { AgentEvent, AgentToolCall, RuntimeState } from "../shared/types";

describe("AgentOrchestrator", () => {
  it("runs the deterministic prepare flow in trusted mode", async () => {
    let state: RuntimeState = createInitialRuntimeState(defaultAppSettings, {
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
    const tools: string[] = [];
    const events: AgentEvent[] = [];
    let complete!: () => void;
    const completePromise = new Promise<void>((resolve) => {
      complete = resolve;
    });

    const fakeBus = {
      requestState: async () => state,
      executeTool: async (toolCall: AgentToolCall) => {
        tools.push(toolCall.tool);
        if (toolCall.tool === "startVirtualDisplay") {
          state = {
            ...state,
            display: { status: "ready", displayId: 7, config: defaultAppSettings.display }
          };
        }
        if (toolCall.tool === "refreshSources") {
          state = {
            ...state,
            sources: [{ id: "screen:7:0", name: "StoryDesk Virtual Display", displayId: "7" }],
            stream: { ...state.stream, sourceId: "screen:7:0" }
          };
        }
        if (toolCall.tool === "startBrowserStream") {
          state = {
            ...state,
            stream: { ...state.stream, status: "live", startedAt: new Date().toISOString() }
          };
        }
        return { id: toolCall.id, ok: true };
      }
    } as unknown as RuntimeCommandBus;

    const orchestrator = new AgentOrchestrator(
      fakeBus,
      () => ({ ...defaultAgentSettings, approvalMode: "trusted", maxAutonomousSteps: 8 }),
      (event) => {
        events.push(event);
        if (event.type === "complete") {
          complete();
        }
      }
    );

    await orchestrator.startGoal("prepare a browser receiver session");
    await completePromise;

    expect(tools).toEqual([
      "startVirtualDisplay",
      "refreshSources",
      "startBrowserStream",
      "openReceiverUrl",
      "collectDiagnostics"
    ]);
    expect(events.some((event) => event.type === "complete")).toBe(true);
  });

  it("pauses for approval in manual mode", async () => {
    const fakeBus = {
      requestState: async () => createInitialRuntimeState(),
      executeTool: async () => ({ id: "unused", ok: true })
    } as unknown as RuntimeCommandBus;
    const events: AgentEvent[] = [];
    let waiting!: () => void;
    const waitingPromise = new Promise<void>((resolve) => {
      waiting = resolve;
    });
    const orchestrator = new AgentOrchestrator(
      fakeBus,
      () => defaultAgentSettings,
      (event) => {
        events.push(event);
        if (event.type === "approval-required") {
          waiting();
        }
      }
    );

    await orchestrator.startGoal("prepare a browser receiver session");
    await waitingPromise;

    expect(orchestrator.getSnapshot().status).toBe("waiting-approval");
    expect(events.find((event) => event.type === "approval-required")).toBeTruthy();
  });

  it("collects diagnostics once and completes", async () => {
    const tools: string[] = [];
    let complete!: () => void;
    const completePromise = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const fakeBus = {
      requestState: async () => createInitialRuntimeState(),
      executeTool: async (toolCall: AgentToolCall) => {
        tools.push(toolCall.tool);
        return { id: toolCall.id, ok: true };
      }
    } as unknown as RuntimeCommandBus;
    const orchestrator = new AgentOrchestrator(
      fakeBus,
      () => ({ ...defaultAgentSettings, approvalMode: "trusted" }),
      (event) => {
        if (event.type === "complete") {
          complete();
        }
      }
    );

    await orchestrator.startGoal("diagnose StoryDesk health");
    await completePromise;

    expect(tools).toEqual(["collectDiagnostics"]);
    expect(orchestrator.getSnapshot().status).toBe("complete");
  });
});
