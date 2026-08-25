import { describe, expect, it } from "vitest";
import {
  createJoinCode,
  createSession,
  createSessionToken,
  normalizeJoinCode
} from "../electron/lib/session";

describe("session", () => {
  it("creates URL-safe tokens", () => {
    expect(createSessionToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("builds local receiver, cast, and websocket URLs", () => {
    const session = createSession("192.168.1.10", 48000, "abc123", "FIRE42", "host456");
    expect(session.hostToken).toBe("host456");
    expect(session.receiverUrl).toBe("http://192.168.1.10:48000/r/abc123");
    expect(session.tvUrl).toBe("http://192.168.1.10:48000/tv");
    expect(session.joinCode).toBe("FIRE42");
    expect(session.joinUrl).toBe("http://192.168.1.10:48000/go/FIRE42");
    expect(session.fallbackUrl).toBe("http://192.168.1.10:48000/fallback/abc123");
    expect(session.castUrl).toBe("http://192.168.1.10:48000/cast/abc123/live.webm");
    expect(session.wsUrl).toBe("ws://192.168.1.10:48000/ws");
  });

  it("creates and normalizes TV join codes", () => {
    expect(createJoinCode()).toMatch(/^[A-Z2-9]{6}$/);
    expect(normalizeJoinCode(" fire-42 ")).toBe("FIRE42");
  });
});
