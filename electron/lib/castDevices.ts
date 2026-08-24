import type { CastDevice } from "./types";

type BonjourServiceLike = {
  name?: string;
  fqdn?: string;
  host?: string;
  port?: number;
  addresses?: string[];
  txt?: Record<string, string | undefined>;
};

export function normalizeCastService(service: BonjourServiceLike): CastDevice | null {
  const host = service.addresses?.find((address) => /^\d+\.\d+\.\d+\.\d+$/.test(address));
  if (!host || !service.port) {
    return null;
  }

  return {
    id: service.txt?.id ?? service.fqdn ?? service.name ?? `${host}:${service.port}`,
    name: service.txt?.fn ?? service.name ?? "Chromecast",
    host,
    port: service.port,
    model: service.txt?.md ?? ""
  };
}
