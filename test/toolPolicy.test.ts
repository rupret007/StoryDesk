import { describe, expect, it } from "vitest";
import { hydrateToolCall, requiresApproval, validateToolName } from "../electron/agent/toolPolicy";

describe("agent tool policy", () => {
  it("requires approval for mutating tools in manual mode", () => {
    expect(requiresApproval("startVirtualDisplay", "manual")).toBe(true);
    expect(requiresApproval("openReceiverUrl", "manual")).toBe(true);
    expect(requiresApproval("collectDiagnostics", "manual")).toBe(false);
  });

  it("allows trusted mode to run tools without approval prompts", () => {
    expect(requiresApproval("startBrowserStream", "trusted")).toBe(false);
  });

  it("validates and hydrates tool calls", () => {
    expect(validateToolName("scanCastDevices")).toBe(true);
    expect(validateToolName("deleteEverything")).toBe(false);
    expect(hydrateToolCall({ tool: "stopStream", args: {} }, "manual")).toMatchObject({
      tool: "stopStream",
      requiresApproval: true
    });
  });
});
