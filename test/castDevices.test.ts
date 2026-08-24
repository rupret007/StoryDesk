import { describe, expect, it } from "vitest";
import { normalizeCastService } from "../electron/lib/castDevices";

describe("normalizeCastService", () => {
  it("normalizes bonjour Cast services", () => {
    expect(
      normalizeCastService({
        name: "Living Room",
        fqdn: "living-room._googlecast._tcp.local",
        addresses: ["fe80::1", "192.168.1.42"],
        port: 8009,
        txt: { id: "device-1", fn: "Living Room TV", md: "Chromecast" }
      })
    ).toEqual({
      id: "device-1",
      name: "Living Room TV",
      host: "192.168.1.42",
      port: 8009,
      model: "Chromecast"
    });
  });

  it("drops services without IPv4 addresses", () => {
    expect(normalizeCastService({ name: "Nope", addresses: ["fe80::1"], port: 8009 })).toBeNull();
  });
});
