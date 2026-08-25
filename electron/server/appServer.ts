import express from "express";
import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { selectLanAddress } from "../lib/network";
import { createSession, normalizeJoinCode } from "../lib/session";
import type { DesktopSession } from "../lib/types";
import { SignalingRoom, type SocketRole } from "../lib/signalingRoom";
import { CastStreamHub } from "./castStreamHub";
import { MjpegStreamHub } from "./mjpegStreamHub";
import { renderFallbackReceiverPage, renderReceiverPage, renderTvJoinPage } from "./receiverPage";

export class AppServer {
  readonly castStreams = new CastStreamHub();
  readonly fallbackStreams = new MjpegStreamHub();
  readonly session: DesktopSession;
  private readonly room = new SignalingRoom();
  private readonly sockets = new Set<WebSocket>();

  private constructor(
    private readonly server: http.Server,
    private readonly wsServer: WebSocketServer,
    session: DesktopSession
  ) {
    this.session = session;
  }

  static async start() {
    const app = express();
    const server = http.createServer(app);
    const wsServer = new WebSocketServer({ noServer: true });
    const host = selectLanAddress();
    const port = await listen(server);
    const instance = new AppServer(server, wsServer, createSession(host, port));

    app.get("/health", (_request, response) => {
      response.set("Cache-Control", "no-store").json({ ok: true });
    });

    app.get("/r/:token", (request, response) => {
      if (request.params.token !== instance.session.token) {
        response.status(404).send("Unknown session");
        return;
      }
      response.type("html").send(renderReceiverPage(request.params.token));
    });

    app.get("/tv", (request, response) => {
      const code = typeof request.query.code === "string"
        ? normalizeJoinCode(request.query.code)
        : "";
      const mode = request.query.mode === "fallback" ? "fallback" : "webrtc";
      if (!code) {
        response.type("html").send(renderTvJoinPage(instance.session));
        return;
      }
      if (code === instance.session.joinCode) {
        response.redirect(302, mode === "fallback"
          ? `/fallback/${instance.session.token}`
          : `/r/${instance.session.token}`);
        return;
      }
      response.status(404).type("html").send(renderTvJoinPage(instance.session, "That code did not match. Check the code on your Mac."));
    });

    app.get("/go/:code", (request, response) => {
      if (normalizeJoinCode(request.params.code) !== instance.session.joinCode) {
        response.status(404).send("Unknown StoryDesk code");
        return;
      }
      response.redirect(302, request.query.mode === "fallback"
        ? `/fallback/${instance.session.token}`
        : `/r/${instance.session.token}`);
    });

    app.get("/fallback/:token", (request, response) => {
      if (request.params.token !== instance.session.token) {
        response.status(404).send("Unknown session");
        return;
      }
      response.type("html").send(renderFallbackReceiverPage(request.params.token));
    });

    app.get("/fallback/:token/live.mjpg", (request, response) => {
      if (request.params.token !== instance.session.token) {
        response.status(404).end();
        return;
      }
      instance.fallbackStreams.subscribe(request.params.token, response);
    });

    app.get("/cast/:token/live.webm", (request, response) => {
      if (request.params.token !== instance.session.token) {
        response.status(404).end();
        return;
      }
      instance.castStreams.subscribe(request.params.token, response);
    });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      const roleValue = url.searchParams.get("role") ?? "receiver";
      if (roleValue !== "host" && roleValue !== "receiver") {
        socket.destroy();
        return;
      }
      const role: SocketRole = roleValue;
      const expectedToken = role === "host"
        ? instance.session.hostToken
        : instance.session.token;
      if (url.pathname !== "/ws" || url.searchParams.get("token") !== expectedToken) {
        socket.destroy();
        return;
      }

      wsServer.handleUpgrade(request, socket, head, (socketInstance) => {
        instance.sockets.add(socketInstance);
        const id =
          url.searchParams.get("id") ??
          (role === "host" ? "host" : cryptoRandomReceiverId());
        const client = {
          id,
          role,
          send: (message: unknown) => {
            if (socketInstance.readyState === socketInstance.OPEN) {
              socketInstance.send(JSON.stringify(message));
            }
          }
        };
        instance.room.register(client);
        socketInstance.on("message", (raw) => {
          try {
            instance.room.route(client, JSON.parse(raw.toString()));
          } catch {
            client.send({ type: "error", data: "Invalid signaling message" });
          }
        });
        socketInstance.on("close", () => {
          instance.sockets.delete(socketInstance);
          instance.room.unregister(client);
        });
      });
    });

    return instance;
  }

  async stop() {
    this.castStreams.reset(this.session.token);
    this.fallbackStreams.reset(this.session.token);
    this.sockets.forEach((socket) => socket.close());
    this.sockets.clear();
    await new Promise<void>((resolve) => {
      this.wsServer.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

function listen(server: http.Server) {
  return new Promise<number>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "0.0.0.0", () => {
      server.off("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

function cryptoRandomReceiverId() {
  return Math.random().toString(36).slice(2, 12);
}
