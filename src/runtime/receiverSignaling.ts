import type { RuntimeReceiverState, Session } from "../types";

type ReceiverCallbacks = {
  onLog(level: "info" | "warn" | "error", message: string): void;
  onReceiverState(patch: Partial<RuntimeReceiverState>): void;
};

type ReceiverRecord = {
  peer?: RTCPeerConnection;
  lastPingSentAt?: number;
  pendingCandidates: RTCIceCandidateInit[];
};

export class ReceiverSignalingService {
  private ws: WebSocket | null = null;
  private readonly receivers = new Map<string, ReceiverRecord>();
  private pingTimer: number | null = null;
  private retryTimer: number | null = null;
  private retryMs = 500;
  private stream: MediaStream | null = null;
  private session: Session | null = null;
  private hostToken = "";
  private stopped = true;

  constructor(private readonly callbacks: ReceiverCallbacks) {}

  start(stream: MediaStream, session: Session, hostToken: string) {
    this.stop();
    this.stream = stream;
    this.session = session;
    this.hostToken = hostToken;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.stream = null;
    this.session = null;
    this.hostToken = "";
    this.clearRetryTimer();
    this.clearPingTimer();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.closeReceivers();
  }

  private connect() {
    const stream = this.stream;
    const session = this.session;
    const hostToken = this.hostToken;
    if (this.stopped || !stream || !session || !hostToken) {
      return;
    }

    const ws = new WebSocket(`${session.wsUrl}?role=host&token=${hostToken}`);
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
      if (this.ws !== ws) {
        return;
      }
      this.retryMs = 500;
      this.callbacks.onLog("info", "Receiver signaling online");
      this.callbacks.onReceiverState({ status: "waiting" });
      this.clearPingTimer();
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
      if (this.ws !== ws) {
        return;
      }
      this.ws = null;
      this.clearPingTimer();
      this.closeReceivers();
      if (this.stopped) {
        return;
      }
      this.callbacks.onLog("warn", "Receiver signaling offline");
      this.callbacks.onReceiverState({
        status: "reconnecting",
        connectedCount: 0
      });
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = null;
        this.connect();
      }, this.retryMs);
      this.retryMs = Math.min(5000, Math.round(this.retryMs * 1.7));
    };
    ws.onerror = () => {
      if (this.ws !== ws || this.stopped) {
        return;
      }
      this.callbacks.onLog("error", "Receiver signaling error");
      this.callbacks.onReceiverState({ status: "error", lastError: "Receiver signaling error" });
    };
    ws.onmessage = async (event) => {
      if (this.ws !== ws || this.stopped) {
        return;
      }
      try {
        const message = JSON.parse(event.data as string);

        if (message.type === "receiver-joined") {
          this.receivers.get(message.receiverId)?.peer?.close();
          this.receivers.set(message.receiverId, { pendingCandidates: [] });
          send({
            type: "host-ready",
            target: "receiver",
            receiverId: message.receiverId
          });
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
          receiver = { pendingCandidates: [] };
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
          await this.flushCandidates(peer, receiver);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendSignal(message.receiverId, {
            type: "answer",
            sdp: answer.sdp
          });
          this.callbacks.onLog("info", "Browser receiver connected");
        }

        if (message.data?.type === "ice" && message.data.candidate) {
          if (peer.remoteDescription) {
            await peer.addIceCandidate(message.data.candidate);
          } else {
            receiver.pendingCandidates.push(message.data.candidate);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.callbacks.onLog("error", `Receiver signaling message failed: ${message}`);
        this.callbacks.onReceiverState({ status: "error", lastError: message });
      }
    };
  }

  private async flushCandidates(peer: RTCPeerConnection, receiver: ReceiverRecord) {
    const candidates = receiver.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      await peer.addIceCandidate(candidate);
    }
  }

  private clearPingTimer() {
    if (this.pingTimer) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearRetryTimer() {
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private closeReceivers() {
    this.receivers.forEach((receiver) => receiver.peer?.close());
    this.receivers.clear();
  }
}
