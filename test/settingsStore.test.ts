import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsStore } from "../electron/lib/settingsStore";
import type { AppSettings } from "../electron/lib/types";

const defaults: AppSettings = {
  display: { width: 1920, height: 1080, fps: 30, hidpi: true },
  stream: { width: 1920, height: 1080, fps: 30, bitrateKbps: 6500 }
};

describe("SettingsStore", () => {
  it("returns defaults when no settings file exists", () => {
    const store = new SettingsStore(path.join(os.tmpdir(), "storydesk-missing.json"), defaults);
    expect(store.read()).toEqual(defaults);
  });

  it("persists settings", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storydesk-"));
    const store = new SettingsStore(path.join(dir, "settings.json"), defaults);
    const next: AppSettings = {
      display: { width: 1280, height: 720, fps: 30, hidpi: false },
      stream: { width: 1280, height: 720, fps: 24, bitrateKbps: 3500 }
    };
    store.write(next);
    expect(store.read()).toEqual(next);
  });
});
