/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defaultAppSettings } from "../shared/runtimeState";
import App from "../src/App";
import { formatFpsChip, formatLatencyChip, formatReceiverCount } from "../src/streamMetrics";

describe("stream metric chips", () => {
  it("does not treat configured fps as a live measurement while idle", () => {
    const configuredFps = defaultAppSettings.stream.fps;
    expect(formatFpsChip(false, undefined)).toBe("— fps");
    expect(formatFpsChip(false, configuredFps)).toBe("— fps");
    expect(formatFpsChip(false, configuredFps)).not.toBe(`${configuredFps} fps`);
    expect(formatLatencyChip(false, undefined)).toBe("— ms");
    expect(formatLatencyChip(false, 12)).toBe("— ms");
  });

  it("pluralizes receivers and shows measured fps only when the stream is live", () => {
    expect(formatReceiverCount(0)).toBe("0 receivers");
    expect(formatReceiverCount(1)).toBe("1 receiver");
    expect(formatReceiverCount(2)).toBe("2 receivers");
    expect(formatFpsChip(true, 24)).toBe("24 fps");
    expect(formatFpsChip(true, undefined)).toBe("— fps");
    expect(formatLatencyChip(true, 18)).toBe("18 ms");
    expect(formatLatencyChip(true, undefined)).toBe("— ms");
  });
});

describe("idle stream metrics in the host UI", () => {
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

  it("does not paint the configured fps as a live metric while the stream is idle", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    const metrics = container.querySelector(".metrics-row");
    expect(metrics).toBeTruthy();
    const metricsText = metrics?.textContent ?? "";
    const configuredFps = defaultAppSettings.stream.fps;

    expect(metricsText).toContain("— fps");
    expect(metricsText).toContain("— ms");
    expect(metricsText).toContain("0 receivers");
    expect(metricsText).not.toContain(`${configuredFps} fps`);
    expect(metricsText).not.toMatch(/(^|[^—])-\s*ms/);
    expect(metricsText).not.toContain("0 receiver ");
    expect(metricsText.endsWith("0 receiver")).toBe(false);

    const bitrateLabel = [...container.querySelectorAll("label")].find((label) =>
      (label.textContent ?? "").includes("Bitrate")
    );
    expect(bitrateLabel?.textContent).toMatch(/Bitrate \(kbps\)/);
  });
});
