import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("storyDesk", {
  display: {
    start: (config: unknown) => ipcRenderer.invoke("display:start", config),
    stop: () => ipcRenderer.invoke("display:stop"),
    onEvent: (callback: (event: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload);
      };
      ipcRenderer.on("display:event", listener);
      return () => ipcRenderer.off("display:event", listener);
    }
  },
  sources: {
    list: () => ipcRenderer.invoke("sources:list")
  },
  session: {
    get: () => ipcRenderer.invoke("session:get")
  },
  receiver: {
    openUrl: (url: string) => ipcRenderer.invoke("receiver:open-url", url),
    resetFallbackStream: (token: string) => ipcRenderer.invoke("receiver:fallback-reset", token),
    publishFallbackFrame: (token: string, frame: ArrayBuffer) => {
      ipcRenderer.send("receiver:fallback-frame", token, new Uint8Array(frame));
    }
  },
  cast: {
    discover: () => ipcRenderer.invoke("cast:discover"),
    connect: (deviceId: string) => ipcRenderer.invoke("cast:connect", deviceId),
    disconnect: () => ipcRenderer.invoke("cast:disconnect"),
    resetStream: (token: string) => ipcRenderer.invoke("cast:stream-reset", token),
    publishChunk: (token: string, chunk: ArrayBuffer) => {
      ipcRenderer.send("cast:chunk", token, new Uint8Array(chunk));
    }
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (settings: unknown) => ipcRenderer.invoke("settings:set", settings)
  },
  agent: {
    getSettings: () => ipcRenderer.invoke("agent:settings:get"),
    setSettings: (settings: unknown) => ipcRenderer.invoke("agent:settings:set", settings),
    getSnapshot: () => ipcRenderer.invoke("agent:snapshot"),
    startGoal: (prompt: string, mode: string) =>
      ipcRenderer.invoke("agent:start-goal", prompt, mode),
    approve: () => ipcRenderer.invoke("agent:approve"),
    stop: () => ipcRenderer.invoke("agent:stop"),
    onEvent: (callback: (event: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload);
      };
      ipcRenderer.on("agent:event", listener);
      return () => ipcRenderer.off("agent:event", listener);
    }
  },
  runtime: {
    onRequest: (callback: (request: unknown) => Promise<unknown>) => {
      const listener = async (_event: Electron.IpcRendererEvent, request: { id: string }) => {
        try {
          const data = await callback(request);
          ipcRenderer.send("runtime:response", { id: request.id, ok: true, data });
        } catch (error) {
          ipcRenderer.send("runtime:response", {
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      };
      ipcRenderer.on("runtime:request", listener);
      return () => ipcRenderer.off("runtime:request", listener);
    },
    publishState: (state: unknown) => ipcRenderer.send("runtime:state-changed", state)
  },
  permissions: {
    openScreenRecording: () => ipcRenderer.invoke("permissions:open-screen-recording")
  }
});
