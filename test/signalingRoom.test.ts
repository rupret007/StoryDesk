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
});
