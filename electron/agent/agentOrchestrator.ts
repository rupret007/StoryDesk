import type { RuntimeCommandBus } from "../lib/runtimeCommandBus";
import type {
  AgentEvent,
  AgentGoal,
  AgentRunSnapshot,
  AgentSettings,
  AgentToolCall,
  AgentToolResult
} from "../../shared/types";
import { hydrateToolCall } from "./toolPolicy";
import {
  LocalDeterministicProvider,
  OpenAICompatibleProvider,
  type AgentProvider,
  type AgentTranscriptEntry
} from "./providers";

type SnapshotStatus = AgentRunSnapshot["status"];

export class AgentOrchestrator {
  private status: SnapshotStatus = "idle";
  private goal: AgentGoal | undefined;
  private pendingToolCall: AgentToolCall | undefined;
  private transcript: AgentTranscriptEntry[] = [];
  private cancelled = false;
  private steps = 0;

  constructor(
    private readonly commandBus: RuntimeCommandBus,
    private readonly getSettings: () => AgentSettings,
    private readonly emit: (event: AgentEvent) => void
  ) {}

  getSnapshot(): AgentRunSnapshot {
    return {
      status: this.status,
      goal: this.goal,
      pendingToolCall: this.pendingToolCall,
      transcript: this.transcript
    };
  }

  async startGoal(prompt: string, mode: AgentGoal["mode"] = "assist") {
    this.cancelled = false;
    this.steps = 0;
    this.pendingToolCall = undefined;
    this.goal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      prompt,
      mode,
      createdAt: new Date().toISOString()
    };
    this.transcript = [{ role: "user", content: prompt, at: new Date().toISOString() }];
    this.setStatus("running");
    this.emit({ type: "started", goal: this.goal });
    void this.advance();
    return this.getSnapshot();
  }

  async approvePendingTool() {
    if (!this.pendingToolCall) {
      return this.getSnapshot();
    }
    const toolCall = { ...this.pendingToolCall, requiresApproval: false };
    this.pendingToolCall = undefined;
    this.setStatus("running");
    await this.executeTool(toolCall);
    void this.advance();
    return this.getSnapshot();
  }

  stop() {
    this.cancelled = true;
    this.pendingToolCall = undefined;
    this.setStatus("stopped");
    this.append("system", "Autopilot stopped.");
    return this.getSnapshot();
  }

  private async advance() {
    if (!this.goal) {
      return;
    }

    const settings = this.getSettings();
    const provider = this.createProvider(settings);
    let lastResult: AgentToolResult | null = null;

    while (!this.cancelled && this.steps < settings.maxAutonomousSteps) {
      this.steps += 1;
      try {
        const state = await this.commandBus.requestState();
        const plan = await provider.plan({
          goal: this.goal,
          state,
          settings,
          transcript: this.transcript
        });
        this.append("assistant", plan.message);
        this.emit({ type: "message", level: "info", message: plan.message });

        if (plan.done || !plan.tool) {
          const summary = await provider.summarize(lastResult);
          this.setStatus("complete");
          this.append("assistant", summary);
          this.emit({ type: "complete", summary });
          return;
        }

        const toolCall = hydrateToolCall(
          {
            tool: plan.tool.tool,
            args: plan.tool.args ?? {},
            reason: plan.tool.reason
          },
          settings.approvalMode
        );
        this.emit({ type: "tool-proposed", toolCall });

        if (toolCall.requiresApproval) {
          this.pendingToolCall = toolCall;
          this.setStatus("waiting-approval");
          this.emit({ type: "approval-required", toolCall });
          return;
        }

        lastResult = await this.executeTool(toolCall);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.setStatus("error");
        this.append("system", message);
        this.emit({ type: "error", message });
        return;
      }
    }

    if (!this.cancelled) {
      this.setStatus("complete");
      this.emit({ type: "complete", summary: "Autopilot reached the step limit." });
    }
  }

  private async executeTool(toolCall: AgentToolCall) {
    this.append("tool", `${toolCall.tool} ${JSON.stringify(toolCall.args)}`);
    const result = await this.commandBus.executeTool(toolCall);
    this.emit({ type: "tool-result", result });
    this.append("tool", `${toolCall.tool} -> ${result.ok ? "ok" : result.error ?? "error"}`);
    return result;
  }

  private createProvider(settings: AgentSettings): AgentProvider {
    if (settings.provider === "openai-compatible") {
      return new OpenAICompatibleProvider();
    }
    return new LocalDeterministicProvider();
  }

  private setStatus(status: SnapshotStatus) {
    this.status = status;
    this.emit({ type: "state", state: status });
  }

  private append(role: AgentTranscriptEntry["role"], content: string) {
    this.transcript = [
      ...this.transcript,
      { role, content, at: new Date().toISOString() }
    ].slice(-50);
  }
}
