import { describe, expect, it } from "vitest";
import { APP_DISPLAY_NAME, MAIN_WINDOW_BASE } from "../electron/lib/appIdentity";

describe("main window identity", () => {
  it("names the Electron window StoryDesk and shows it only after load", () => {
    expect(APP_DISPLAY_NAME).toBe("StoryDesk");
    expect(MAIN_WINDOW_BASE.title).toBe("StoryDesk");
    expect(MAIN_WINDOW_BASE.show).toBe(false);
  });
});
