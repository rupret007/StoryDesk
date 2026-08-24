export type SocketRole = "host" | "receiver";

export type SignalingEnvelope = {
  type: string;
  target?: SocketRole;
  receiverId?: string;
  data?: unknown;
};

type Client = {
  id: string;
  role: SocketRole;
  send(message: SignalingEnvelope): void;
};

export class SignalingRoom {
  private host: Client | null = null;
  private readonly receivers = new Map<string, Client>();

  register(client: Client) {
    if (client.role === "host") {
      this.host = client;
      for (const receiverId of this.receivers.keys()) {
        client.send({ type: "receiver-joined", receiverId });
      }
      return;
    }

    this.receivers.set(client.id, client);
    this.host?.send({ type: "receiver-joined", receiverId: client.id });
  }

  unregister(client: Pick<Client, "id" | "role">) {
    if (client.role === "host" && this.host?.id === client.id) {
      this.host = null;
      return;
    }

    this.receivers.delete(client.id);
    this.host?.send({ type: "receiver-left", receiverId: client.id });
  }

  route(sender: Pick<Client, "id" | "role">, envelope: SignalingEnvelope) {
    if (envelope.target === "host" && this.host) {
      this.host.send({
        type: envelope.type,
        receiverId: sender.id,
        data: envelope.data
      });
      return;
    }

    if (envelope.target === "receiver" && envelope.receiverId) {
      this.receivers.get(envelope.receiverId)?.send({
        type: envelope.type,
        receiverId: envelope.receiverId,
        data: envelope.data
      });
    }
  }
}
