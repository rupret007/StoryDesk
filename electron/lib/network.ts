import os from "node:os";

export type NetworkInterfaces = ReturnType<typeof os.networkInterfaces>;

export function selectLanAddress(interfaces: NetworkInterfaces = os.networkInterfaces()) {
  const candidates = Object.values(interfaces)
    .flatMap((details) => details ?? [])
    .filter((details) => details.family === "IPv4")
    .filter((details) => !details.internal)
    .filter((details) => !details.address.startsWith("169.254."));

  return candidates[0]?.address ?? "127.0.0.1";
}
