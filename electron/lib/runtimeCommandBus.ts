import type { IpcMain, WebContents } from "electron";
import type {
  AgentToolCall,
  AgentToolResult,
  RuntimeRequest,
  RuntimeResponse,
  RuntimeState
} from "./types";

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

export class RuntimeCommandBus {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly stateCallbacks = new Set<(state: RuntimeState) => void>();
  private latestState: RuntimeState | null = null;

  constructor(private readonly getWebContents: () => WebContents | null | undefined) {}

  bind(ipcMain: IpcMain) {
    ipcMain.on("runtime:response", (_event, response: RuntimeResponse) => {
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error));
      }
    });

    ipcMain.on("runtime:state-changed", (_event, state: RuntimeState) => {
      this.latestState = state;
      this.stateCallbacks.forEach((callback) => callback(state));
    });
  }

  onStateChanged(callback: (state: RuntimeState) => void) {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  getCachedState() {
    return this.latestState;
  }

  requestState() {
    return this.sendRequest<RuntimeState>({ id: createRequestId(), type: "runtime:getState" });
  }

  executeTool(toolCall: AgentToolCall) {
    return this.sendRequest<AgentToolResult>({
      id: createRequestId(),
      type: "runtime:executeTool",
      toolCall
    });
  }

  private sendRequest<T>(request: RuntimeRequest, timeoutMs = 10_000) {
    const webContents = this.getWebContents();
    if (!webContents || webContents.isDestroyed()) {
      return Promise.reject(new Error("Renderer is not available"));
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Runtime request timed out: ${request.type}`));
      }, timeoutMs);

      this.pending.set(request.id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });
      webContents.send("runtime:request", request);
    });
  }
}

function createRequestId() {
  return `runtime-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
