import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../electron/agent/providers";
import { createInitialRuntimeState, defaultAgentSettings, defaultAppSettings } from "../shared/runtimeState";

describe("OpenAICompatibleProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redacts local credentials and details from provider requests", async () => {
    const state = createInitialRuntimeState(defaultAppSettings, {
      token: "secret-session-token",
      receiverUrl: "http://192.168.1.20:4000/r/secret-session-token",
      tvUrl: "http://192.168.1.20:4000/tv",
      joinCode: "SECRET",
      joinUrl: "http://192.168.1.20:4000/go/SECRET",
      fallbackUrl: "http://192.168.1.20:4000/fallback/secret-session-token",
      castUrl: "http://192.168.1.20:4000/cast/secret-session-token/live.webm",
      wsUrl: "ws://192.168.1.20:4000/ws",
      status: "ready"
    });
    state.sources = [{ id: "screen:private", name: "Private Display", displayId: "7" }];
    state.cast.devices = [{
      id: "cast-private",
      name: "Living Room",
      host: "192.168.1.30",
      port: 8009,
      model: "Chromecast"
    }];
    state.diagnostics.logs = [{
      level: "error",
      message: "private diagnostic detail",
      at: new Date().toISOString()
    }];

    let requestBody = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      requestBody = String(init.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ message: "Done", done: true }) } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const provider = new OpenAICompatibleProvider();
    await provider.plan({
      goal: {
        id: "goal-1",
        prompt: "check the session",
        mode: "assist",
        createdAt: new Date().toISOString()
      },
      state,
      settings: {
        ...defaultAgentSettings,
        provider: "openai-compatible",
        endpoint: "https://provider.example/v1",
        apiKey: "provider-key"
      },
      transcript: []
    });

    const body = JSON.parse(requestBody) as {
      messages: Array<{ role: string; content: string }>;
    };
    const providerContext = JSON.parse(
      body.messages.find((message) => message.role === "user")?.content ?? "{}"
    ) as { state?: { sessionReady?: boolean; sourceCount?: number } };

    expect(providerContext.state?.sessionReady).toBe(true);
    expect(providerContext.state?.sourceCount).toBe(1);
    expect(requestBody).not.toContain("secret-session-token");
    expect(requestBody).not.toContain("SECRET");
    expect(requestBody).not.toContain("192.168.1.");
    expect(requestBody).not.toContain("Private Display");
    expect(requestBody).not.toContain("private diagnostic detail");
  });
});
