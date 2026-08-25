import type { AgentApprovalMode, AgentToolCall, AgentToolName } from "../../shared/types";

export const availableAgentTools: AgentToolName[] = [
  "startVirtualDisplay",
  "stopVirtualDisplay",
  "refreshSources",
  "startBrowserStream",
  "stopStream",
  "openReceiverUrl",
  "scanCastDevices",
  "collectDiagnostics"
];

const mutatingTools = new Set<AgentToolName>([
  "startVirtualDisplay",
  "stopVirtualDisplay",
  "startBrowserStream",
  "stopStream",
  "openReceiverUrl",
  "scanCastDevices"
]);

export function validateToolName(tool: string): tool is AgentToolName {
  return availableAgentTools.includes(tool as AgentToolName);
}

export function requiresApproval(tool: AgentToolName, mode: AgentApprovalMode) {
  return mode !== "trusted" && mutatingTools.has(tool);
}

export function hydrateToolCall(
  partial: Pick<AgentToolCall, "tool" | "args"> & Partial<AgentToolCall>,
  mode: AgentApprovalMode
): AgentToolCall {
  return {
    id: partial.id ?? createToolCallId(),
    tool: partial.tool,
    args: partial.args ?? {},
    requiresApproval: requiresApproval(partial.tool, mode),
    reason: partial.reason
  };
}

function createToolCallId() {
  return `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
