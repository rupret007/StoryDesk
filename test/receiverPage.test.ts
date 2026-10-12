import { describe, expect, it } from "vitest";
import { renderFallbackReceiverPage, renderReceiverPage } from "../electron/server/receiverPage";

describe("receiver page wait copy", () => {
  it("gives the WebRTC receiver a human sentence that names StoryDesk", () => {
    const html = renderReceiverPage("token-123");
    const statusMatch = html.match(/<div id="status"[^>]*>([^<]*)<\/div>/);
    expect(statusMatch).not.toBeNull();
    const [tag, text] = statusMatch!;
    expect(tag).toContain('role="status"');
    expect(text).toMatch(/StoryDesk/);
    expect(text.trim().split(/\s+/).length).toBeGreaterThan(2);

    expect(html).toContain('setStatus("Waiting for StoryDesk to start the stream")');
  });

  it("gives the compatibility receiver the same kind of human wait sentence", () => {
    const html = renderFallbackReceiverPage("token-123");
    const statusMatch = html.match(/<div id="status"[^>]*>([^<]*)<\/div>/);
    expect(statusMatch).not.toBeNull();
    const [tag, text] = statusMatch!;
    expect(tag).toContain('role="status"');
    expect(text).toMatch(/StoryDesk/);
    expect(text.trim().split(/\s+/).length).toBeGreaterThan(2);
  });

  it("gives the compatibility image a non-empty fallback alt", () => {
    const html = renderFallbackReceiverPage("token-123");
    const imgMatch = html.match(/<img id="screen"[^>]*\salt="([^"]*)"/);
    expect(imgMatch).not.toBeNull();
    expect(imgMatch![1].trim().length).toBeGreaterThan(0);
  });
});
