import type { RuntimeReceiverState, Session } from "../types";

type ReceiverCallbacks = {
  onLog(level: "info" | "warn" | "error", message: string): void;
  onReceiverState(patch: Partial<RuntimeReceiverState>): void;
};

type ReceiverRecord = {
  peer?: RTCPeerConnection;
  lastPingSentAt?: number;
};

export class ReceiverSignalingService {
  private ws: WebSocket | null = null;
  private readonly receivers = new Map<string, ReceiverRecord>();
  private pingTimer: number | null = null;

  constructor(private readonly callbacks: ReceiverCallbacks) {}

  start(stream: MediaStream, session: Session) {
    this.stop();
    const ws = new WebSocket(`${session.wsUrl}?role=host&token=${session.token}`);
    this.ws = ws;

    const send = (payload: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };

    const sendSignal = (receiverId: string, data: unknown) => {
      send({
        type: "signal",
        target: "receiver",
        receiverId,
        data
      });
    };

    ws.onopen = () => {
      this.callbacks.onLog("info", "Receiver signaling online");
      this.callbacks.onReceiverState({ status: "waiting" });
      this.pingTimer = window.setInterval(() => {
        for (const [receiverId, receiver] of this.receivers.entries()) {
          const sentAt = performance.now();
          receiver.lastPingSentAt = sentAt;
          send({
            type: "receiver-ping",
            target: "receiver",
            receiverId,
            data: { sentAt }
          });
        }
      }, 1000);
    };
    ws.onclose = () => {
      this.callbacks.onLog("warn", "Receiver signaling offline");
      this.callbacks.onReceiverState({
        status: this.receivers.size > 0 ? "reconnecting" : "offline",
        connectedCount: 0
      });
    };
    ws.onerror = () => {
      this.callbacks.onLog("error", "Receiver signaling error");
      this.callbacks.onReceiverState({ status: "error", lastError: "Receiver signaling error" });
    };
    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data as string);

      if (message.type === "receiver-joined") {
        this.receivers.set(message.receiverId, {});
        this.callbacks.onReceiverState({
          status: "waiting",
          connectedCount: this.receivers.size,
          lastSeenAt: new Date().toISOString()
        });
        return;
      }

      if (message.type === "receiver-left") {
        this.receivers.get(message.receiverId)?.peer?.close();
        this.receivers.delete(message.receiverId);
        this.callbacks.onReceiverState({
          status: this.receivers.size > 0 ? "connected" : "waiting",
          connectedCount: this.receivers.size
        });
        return;
      }

      if (message.type === "receiver-pong") {
        const receiver = this.receivers.get(message.receiverId);
        const sentAt = Number(message.data?.sentAt ?? receiver?.lastPingSentAt);
        if (Number.isFinite(sentAt)) {
          this.callbacks.onReceiverState({
            latencyMs: Math.max(0, Math.round(performance.now() - sentAt)),
            lastSeenAt: new Date().toISOString()
          });
        }
        return;
      }

      if (message.type === "receiver-metrics") {
        this.callbacks.onReceiverState({
          status: "connected",
          bitrateKbps: message.data?.bitrateKbps,
          frameRate: message.data?.frameRate,
          lastSeenAt: new Date().toISOString()
        });
        return;
      }

      if (message.type !== "signal" || !message.receiverId) {
        return;
      }

      let receiver = this.receivers.get(message.receiverId);
      if (!receiver) {
        receiver = {};
        this.receivers.set(message.receiverId, receiver);
      }
      let peer = receiver.peer;
      if (!peer) {
        peer = new RTCPeerConnection({ iceServers: [] });
        receiver.peer = peer;
        stream.getTracks().forEach((track) => peer?.addTrack(track, stream));
        peer.onicecandidate = (candidateEvent) => {
          if (candidateEvent.candidate) {
            sendSignal(message.receiverId, {
              type: "ice",
              candidate: candidateEvent.candidate
            });
          }
        };
        peer.onconnectionstatechange = () => {
          if (peer?.connectionState === "connected") {
            this.callbacks.onReceiverState({
              status: "connected",
              connectedCount: this.receivers.size,
              lastSeenAt: new Date().toISOString()
            });
          }
        };
      }

      if (message.data?.type === "offer") {
        await peer.setRemoteDescription({
          type: "offer",
          sdp: message.data.sdp
        });
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal(message.receiverId, {
          type: "answer",
          sdp: answer.sdp
        });
        this.callbacks.onLog("info", "Browser receiver connected");
      }

      if (message.data?.type === "ice" && message.data.candidate) {
        await peer.addIceCandidate(message.data.candidate);
      }
    };
  }

  stop() {
    if (this.pingTimer) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.receivers.forEach((receiver) => receiver.peer?.close());
    this.receivers.clear();
  }
}
