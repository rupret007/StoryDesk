import type {
  AgentGoal,
  AgentSettings,
  AgentToolName,
  AgentToolResult,
  RuntimeState
} from "../../shared/types";
import { availableAgentTools, validateToolName } from "./toolPolicy";

export type AgentTranscriptEntry = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  at: string;
};

export type AgentPlan = {
  message: string;
  done?: boolean;
  tool?: {
    tool: AgentToolName;
    args?: Record<string, unknown>;
    reason?: string;
  };
};

export type AgentProviderContext = {
  goal: AgentGoal;
  state: RuntimeState;
  settings: AgentSettings;
  transcript: AgentTranscriptEntry[];
};

export interface AgentProvider {
  plan(context: AgentProviderContext): Promise<AgentPlan>;
  summarize(result: AgentToolResult | null): Promise<string>;
}

export class LocalDeterministicProvider implements AgentProvider {
  async plan({ goal, state, transcript }: AgentProviderContext): Promise<AgentPlan> {
    const prompt = goal.prompt.toLowerCase();
    const called = new Set(
      transcript
        .filter((entry) => entry.role === "tool")
        .map((entry) => entry.content.split(" ")[0])
    );

    if (prompt.includes("stop") || prompt.includes("shutdown")) {
      if (state.stream.status === "live" || state.stream.status === "starting") {
        return tool("stopStream", "Stop the active screen stream first.");
      }
      if (state.display.status === "ready" || state.display.status === "starting") {
        return tool("stopVirtualDisplay", "Remove the virtual display after stopping the stream.");
      }
      return done("StoryDesk is already stopped.");
    }

    if (prompt.includes("diagnose") || prompt.includes("health")) {
      return tool("collectDiagnostics", "Collect the current runtime snapshot and recent logs.");
    }

    if (state.display.status !== "ready") {
      return tool("startVirtualDisplay", "A browser receiver session needs a live virtual display.");
    }

    if (state.sources.length === 0) {
      return tool("refreshSources", "Find the StoryDesk virtual display in Electron's capture sources.");
    }

    if (state.stream.status !== "live") {
      return tool("startBrowserStream", "Start the browser-first WebRTC stream.");
    }

    if (!called.has("openReceiverUrl")) {
      return tool("openReceiverUrl", "Open the local browser receiver so the session can be observed.");
    }

    if (!called.has("collectDiagnostics")) {
      return tool("collectDiagnostics", "Verify receiver, stream, and display status.");
    }

    return done("Browser receiver session is prepared.");
  }

  async summarize(result: AgentToolResult | null) {
    if (!result) {
      return "No tool result was produced.";
    }
    return result.ok ? "Tool completed successfully." : `Tool failed: ${result.error ?? "unknown error"}`;
  }
}

export class OpenAICompatibleProvider implements AgentProvider {
  private readonly fallback = new LocalDeterministicProvider();

  async plan(context: AgentProviderContext): Promise<AgentPlan> {
    const { settings } = context;
    if (!settings.endpoint || !settings.apiKey) {
      return this.fallback.plan(context);
    }

    const response = await fetch(settings.endpoint.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You control StoryDesk through tools. Return JSON: {\"message\":string,\"done\"?:boolean,\"tool\"?:{\"tool\":string,\"args\"?:object,\"reason\"?:string}}. Available tools: " +
              availableAgentTools.join(", ")
          },
          {
            role: "user",
            content: JSON.stringify({
              goal: context.goal.prompt,
              state: context.state,
              transcript: context.transcript.slice(-10)
            })
          }
        ]
      })
    });

    if (!response.ok) {
      return this.fallback.plan(context);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return this.fallback.plan(context);
    }

    try {
      const parsed = JSON.parse(content) as AgentPlan;
      if (parsed.tool && !validateToolName(parsed.tool.tool)) {
        return this.fallback.plan(context);
      }
      return parsed;
    } catch {
      return this.fallback.plan(context);
    }
  }

  async summarize(result: AgentToolResult | null) {
    return this.fallback.summarize(result);
  }
}

function tool(toolName: AgentToolName, reason: string): AgentPlan {
  return {
    message: reason,
    tool: { tool: toolName, args: {}, reason }
  };
}

function done(message: string): AgentPlan {
  return { message, done: true };
}
