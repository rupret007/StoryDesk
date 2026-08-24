import { describe, expect, it } from "vitest";
import { selectLanAddress } from "../electron/lib/network";

describe("selectLanAddress", () => {
  it("prefers non-internal IPv4 addresses", () => {
    expect(
      selectLanAddress({
        lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "", cidr: null, mac: "" }],
        en0: [{ address: "192.168.1.20", family: "IPv4", internal: false, netmask: "", cidr: null, mac: "" }]
      })
    ).toBe("192.168.1.20");
  });

  it("falls back to localhost", () => {
    expect(
      selectLanAddress({
        lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "", cidr: null, mac: "" }]
      })
    ).toBe("127.0.0.1");
  });
});
