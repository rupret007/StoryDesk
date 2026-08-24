import { WebSocket } from "ws";
import { describe, expect, it } from "vitest";
import { AppServer } from "../electron/server/appServer";

describe("AppServer signaling", () => {
  it("routes receiver joins and metrics to the host", async () => {
    const server = await AppServer.start();
    const host = new WebSocket(`${server.session.wsUrl}?role=host&token=${server.session.token}`);
    const receiver = new WebSocket(
      `${server.session.wsUrl}?role=receiver&token=${server.session.token}&id=receiver-1`
    );

    const messages: any[] = [];
    host.on("message", (raw) => messages.push(JSON.parse(raw.toString())));

    await waitForOpen(host);
    await waitForOpen(receiver);
    await waitFor(() => messages.some((message) => message.type === "receiver-joined"));

    receiver.send(
      JSON.stringify({
        type: "receiver-metrics",
        target: "host",
        data: { frameRate: 30, bitrateKbps: 4500 }
      })
    );

    await waitFor(() => messages.some((message) => message.type === "receiver-metrics"));

    expect(messages).toContainEqual({ type: "receiver-joined", receiverId: "receiver-1" });
    expect(messages).toContainEqual({
      type: "receiver-metrics",
      receiverId: "receiver-1",
      data: { frameRate: 30, bitrateKbps: 4500 }
    });

    host.close();
    receiver.close();
    await server.stop();
  });

  it("rejects invalid websocket tokens", async () => {
    const server = await AppServer.start();
    const ws = new WebSocket(`${server.session.wsUrl}?role=host&token=bad`);
    await new Promise<void>((resolve) => {
      ws.on("close", () => resolve());
      ws.on("error", () => resolve());
    });
    expect(ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING).toBe(true);
    await server.stop();
  });

  it("serves the fallback receiver and relays mjpeg frames", async () => {
    const server = await AppServer.start();
    const fallbackPage = await fetch(localUrl(server.session.fallbackUrl));
    expect(fallbackPage.status).toBe(200);
    expect(await fallbackPage.text()).toContain("StoryDesk Compatibility Receiver");

    server.fallbackStreams.publish(
      server.session.token,
      Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    );

    const streamResponse = await fetch(`${localUrl(server.session.fallbackUrl)}/live.mjpg`);
    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toContain("multipart/x-mixed-replace");

    const reader = streamResponse.body?.getReader();
    expect(reader).toBeTruthy();
    const text = await readStreamText(reader!);
    expect(text).toContain("Content-Type: image/jpeg");
    expect(text).toContain("Content-Length: 4");
    await reader?.cancel();
    await server.stop();
  });

  it("redirects tv join compatibility mode to the fallback receiver", async () => {
    const server = await AppServer.start();
    const tvUrl = new URL(localUrl(server.session.tvUrl));
    tvUrl.searchParams.set("code", server.session.joinCode.toLowerCase());
    tvUrl.searchParams.set("mode", "fallback");

    const response = await fetch(tvUrl, { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/fallback/${server.session.token}`);
    await server.stop();
  });
});

function waitForOpen(ws: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

async function waitFor(assertion: () => boolean, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}

function localUrl(urlValue: string) {
  const url = new URL(urlValue);
  url.hostname = "127.0.0.1";
  return url.toString();
}

async function readStreamText(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  const startedAt = Date.now();
  let text = "";
  while (Date.now() - startedAt < 2000) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 50)
      )
    ]);
    if (chunk.done) {
      if (text) {
        return text;
      }
      continue;
    }
    text += decoder.decode(chunk.value, { stream: true });
    if (text.includes("Content-Length: 4")) {
      return text;
    }
  }
  throw new Error("Timed out reading stream text");
}
