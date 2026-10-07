import { describe, expect, it } from "vitest";
import { SignalingRoom, type SignalingEnvelope } from "../electron/lib/signalingRoom";

describe("SignalingRoom", () => {
  it("routes receiver offers to the host and answers back to receivers", () => {
    const room = new SignalingRoom();
    const hostMessages: SignalingEnvelope[] = [];
    const receiverMessages: SignalingEnvelope[] = [];

    room.register({ id: "host", role: "host", send: (message) => hostMessages.push(message) });
    room.register({
      id: "receiver-1",
      role: "receiver",
      send: (message) => receiverMessages.push(message)
    });

    expect(hostMessages).toContainEqual({ type: "receiver-joined", receiverId: "receiver-1" });

    room.route(
      { id: "receiver-1", role: "receiver" },
      { type: "signal", target: "host", data: { type: "offer" } }
    );
    expect(hostMessages.at(-1)).toEqual({
      type: "signal",
      receiverId: "receiver-1",
      data: { type: "offer" }
    });

    room.route(
      { id: "host", role: "host" },
      {
        type: "signal",
        target: "receiver",
        receiverId: "receiver-1",
        data: { type: "answer" }
      }
    );
    expect(receiverMessages.at(-1)).toEqual({
      type: "signal",
      receiverId: "receiver-1",
      data: { type: "answer" }
    });
  });

  it("keeps a reconnected receiver when the previous socket unregisters", () => {
    const room = new SignalingRoom();
    const hostMessages: SignalingEnvelope[] = [];
    const secondMessages: SignalingEnvelope[] = [];
    const host = {
      id: "host",
      role: "host" as const,
      send: (message: SignalingEnvelope) => hostMessages.push(message)
    };
    const first = {
      id: "receiver-1",
      role: "receiver" as const,
      send: () => undefined
    };
    const second = {
      id: "receiver-1",
      role: "receiver" as const,
      send: (message: SignalingEnvelope) => secondMessages.push(message)
    };

    room.register(host);
    room.register(first);
    room.register(second);
    room.unregister(first);

    room.route(host, {
      type: "signal",
      target: "receiver",
      receiverId: "receiver-1",
      data: { type: "answer" }
    });

    expect(secondMessages.at(-1)).toEqual({
      type: "signal",
      receiverId: "receiver-1",
      data: { type: "answer" }
    });
    expect(hostMessages.filter((message) => message.type === "receiver-left")).toEqual([]);
  });

  it("keeps a replacement host when the previous host disconnects", () => {
    const room = new SignalingRoom();
    const secondMessages: SignalingEnvelope[] = [];
    const firstHost = {
      id: "host",
      role: "host" as const,
      send: () => undefined
    };
    const secondHost = {
      id: "host",
      role: "host" as const,
      send: (message: SignalingEnvelope) => secondMessages.push(message)
    };
    const receiver = {
      id: "receiver-1",
      role: "receiver" as const,
      send: () => undefined
    };

    room.register(firstHost);
    room.register(receiver);
    room.register(secondHost);
    room.unregister(firstHost);

    room.route(receiver, {
      type: "receiver-metrics",
      target: "host",
      data: { frameRate: 24 }
    });

    expect(secondMessages).toContainEqual({
      type: "receiver-metrics",
      receiverId: "receiver-1",
      data: { frameRate: 24 }
    });
  });
});
