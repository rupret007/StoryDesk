import { app, BrowserWindow, desktopCapturer, ipcMain, shell } from "electron";
import path from "node:path";
import { AppServer } from "./server/appServer";
import { CastController } from "./server/castController";
import { VirtualDisplayHelper } from "./server/virtualDisplayHelper";
import { SettingsStore } from "./lib/settingsStore";
import { RuntimeCommandBus } from "./lib/runtimeCommandBus";
import { AgentOrchestrator } from "./agent/agentOrchestrator";
import { defaultAgentSettings, defaultAppSettings } from "../shared/runtimeState";
import type { AgentSettings, AppSettings } from "./lib/types";

let mainWindow: BrowserWindow | null = null;
let appServer: AppServer | null = null;
let castController: CastController | null = null;
let displayHelper: VirtualDisplayHelper | null = null;
let settingsStore: SettingsStore<AppSettings> | null = null;
let agentSettingsStore: SettingsStore<AgentSettings> | null = null;
let runtimeCommandBus: RuntimeCommandBus | null = null;
let agentOrchestrator: AgentOrchestrator | null = null;
let shutdownPromise: Promise<void> | null = null;
let quitAfterShutdown = false;

function rendererUrl() {
  return process.env.STORYDESK_DEV_SERVER_URL
    ? process.env.STORYDESK_DEV_SERVER_URL
    : `file://${path.join(__dirname, "../../dist/index.html")}`;
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 980,
    minHeight: 720,
    title: "StoryDesk",
    backgroundColor: "#f4f1ea",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  await window.loadURL(rendererUrl());
}

function sendDisplayEvent(event: unknown) {
  mainWindow?.webContents.send("display:event", event);
}

app.whenReady().then(async () => {
  settingsStore = new SettingsStore(
    path.join(app.getPath("userData"), "settings.json"),
    defaultAppSettings
  );
  agentSettingsStore = new SettingsStore(
    path.join(app.getPath("userData"), "agent-settings.json"),
    defaultAgentSettings
  );
  appServer = await AppServer.start();
  castController = new CastController(appServer.session, appServer.castStreams);
  displayHelper = new VirtualDisplayHelper(sendDisplayEvent);
  runtimeCommandBus = new RuntimeCommandBus(() => mainWindow?.webContents);
  runtimeCommandBus.bind(ipcMain);
  agentOrchestrator = new AgentOrchestrator(
    runtimeCommandBus,
    () => agentSettingsStore?.read() ?? defaultAgentSettings,
    (event) => mainWindow?.webContents.send("agent:event", event)
  );
  registerIpcHandlers();
  await createWindow();
}).catch((error) => {
  console.error("StoryDesk failed to start", error);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  if (quitAfterShutdown) {
    return;
  }
  event.preventDefault();
  void shutdown().finally(() => {
    quitAfterShutdown = true;
    app.quit();
  });
});

function shutdown() {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      agentOrchestrator?.stop();
      await Promise.allSettled([
        castController?.shutdown(),
        displayHelper?.shutdown(),
        appServer?.stop()
      ]);
    })();
  }
  return shutdownPromise;
}

function registerIpcHandlers() {
  ipcMain.handle("settings:get", () => settingsStore?.read() ?? defaultAppSettings);
  ipcMain.handle("settings:set", (_event, settings: AppSettings) => {
    return settingsStore?.write(settings) ?? settings;
  });
  ipcMain.handle("agent:settings:get", () => agentSettingsStore?.read() ?? defaultAgentSettings);
  ipcMain.handle("agent:settings:set", (_event, settings: AgentSettings) => {
    return agentSettingsStore?.write(settings) ?? settings;
  });
  ipcMain.handle("agent:snapshot", () => agentOrchestrator?.getSnapshot());
  ipcMain.handle("agent:start-goal", (_event, prompt: string, mode = "assist") => {
    return agentOrchestrator?.startGoal(prompt, mode as "assist" | "autonomous");
  });
  ipcMain.handle("agent:approve", () => agentOrchestrator?.approvePendingTool());
  ipcMain.handle("agent:stop", () => agentOrchestrator?.stop());

  ipcMain.handle("session:get", () => appServer?.session);
  ipcMain.handle("receiver:open-url", async (_event, url: string) => {
    await shell.openExternal(url);
  });
  ipcMain.handle("receiver:fallback-reset", async (_event, token: string) => {
    appServer?.fallbackStreams.reset(token);
  });
  ipcMain.on("receiver:fallback-frame", (_event, token: string, bytes: Uint8Array) => {
    appServer?.fallbackStreams.publish(token, Buffer.from(bytes));
  });

  ipcMain.handle("display:start", async (_event, config) => {
    await displayHelper?.start(config);
  });
  ipcMain.handle("display:stop", async () => {
    await displayHelper?.stop();
  });

  ipcMain.handle("sources:list", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 480, height: 270 }
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      thumbnailDataUrl: source.thumbnail.toDataURL()
    }));
  });

  ipcMain.handle("cast:discover", async () => castController?.discover() ?? []);
  ipcMain.handle("cast:connect", async (_event, deviceId: string) => {
    await castController?.connect(deviceId);
  });
  ipcMain.handle("cast:disconnect", async () => {
    await castController?.disconnect();
  });
  ipcMain.handle("cast:stream-reset", async (_event, token: string) => {
    appServer?.castStreams.reset(token);
  });
  ipcMain.on("cast:chunk", (_event, token: string, bytes: Uint8Array) => {
    appServer?.castStreams.publish(token, Buffer.from(bytes));
  });

  ipcMain.handle("permissions:open-screen-recording", async () => {
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    );
  });
}
