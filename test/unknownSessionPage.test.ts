import { describe, expect, it } from "vitest";
import { AppServer } from "../electron/server/appServer";
import { renderUnknownSessionPage } from "../electron/server/receiverPage";

const UNKNOWN_SESSION_COPY =
  "This link is not a live session. Open a new QR or TV code from the app.";

describe("unknown session 404 page", () => {
  it("renders StoryDesk heading and the live-session sentence in TV-join chrome", () => {
    const html = renderUnknownSessionPage();

    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<h1>StoryDesk</h1>");
    expect(html).toContain(UNKNOWN_SESSION_COPY);
    expect(html).toContain("radial-gradient");
    expect(html).toContain('href="/tv"');
    expect(html).toContain("Enter a TV code");
    expect(html).not.toMatch(/^Unknown session$/);
  });
});

describe("unknown session HTTP 404", () => {
  it("keeps HTTP 404 on /r/:bad and returns the StoryDesk HTML page", async () => {
    const server = await AppServer.start();
    const url = new URL(localUrl(server.session.receiverUrl));
    url.pathname = "/r/not-the-token";

    try {
      const response = await fetch(url);
      const body = await response.text();
      const contentType = response.headers.get("content-type") ?? "";

      expect(response.status).toBe(404);
      expect(contentType).toMatch(/text\/html/i);
      expect(body).toContain("<h1>StoryDesk</h1>");
      expect(body).toContain(UNKNOWN_SESSION_COPY);
      expect(body.trim()).not.toBe("Unknown session");
    } finally {
      await server.stop();
    }
  });

  it("keeps HTTP 404 on /fallback/:bad and returns the same StoryDesk HTML page", async () => {
    const server = await AppServer.start();
    const url = new URL(localUrl(server.session.fallbackUrl));
    url.pathname = "/fallback/not-the-token";

    try {
      const response = await fetch(url);
      const body = await response.text();
      const contentType = response.headers.get("content-type") ?? "";

      expect(response.status).toBe(404);
      expect(contentType).toMatch(/text\/html/i);
      expect(body).toContain("<h1>StoryDesk</h1>");
      expect(body).toContain(UNKNOWN_SESSION_COPY);
      expect(body.trim()).not.toBe("Unknown session");
    } finally {
      await server.stop();
    }
  });
});

function localUrl(urlValue: string) {
  const url = new URL(urlValue);
  url.hostname = "127.0.0.1";
  return url.toString();
}
