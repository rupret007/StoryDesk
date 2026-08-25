import crypto from "node:crypto";
import type { DesktopSession } from "./types";

const joinAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createSession(
  host: string,
  port: number,
  token = createSessionToken(),
  joinCode = createJoinCode(),
  hostToken = createSessionToken()
): DesktopSession {
  return {
    token,
    hostToken,
    receiverUrl: `http://${host}:${port}/r/${token}`,
    tvUrl: `http://${host}:${port}/tv`,
    joinCode,
    joinUrl: `http://${host}:${port}/go/${joinCode}`,
    fallbackUrl: `http://${host}:${port}/fallback/${token}`,
    castUrl: `http://${host}:${port}/cast/${token}/live.webm`,
    wsUrl: `ws://${host}:${port}/ws`,
    status: "ready"
  };
}

export function createSessionToken() {
  return crypto.randomBytes(9).toString("base64url");
}

export function createJoinCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((byte) => joinAlphabet[byte % joinAlphabet.length])
    .join("");
}

export function normalizeJoinCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
