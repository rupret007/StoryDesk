/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "../src/App";

describe("main window accessibility", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("names the shell and primary controls and focuses the main window", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    const main = container.querySelector("main");
    expect(main?.getAttribute("aria-label")).toBe("StoryDesk");
    expect(document.activeElement).toBe(main);
    expect(container.querySelector('[aria-label="Capture source"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Refresh sources"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Virtual display preview"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Start virtual display"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Start stream"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Copy receiver URL"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Copy TV join details"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Chromecast device"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Autopilot goal"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Desktop off"]')).toBeTruthy();
    const notice = container.querySelector(".notice-band");
    expect(notice?.getAttribute("role")).toBe("status");
    expect(notice?.textContent).toContain("Browser preview mode");
  });
});
