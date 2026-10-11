const EM_DASH = "—";

export function formatReceiverCount(count: number): string {
  return count === 1 ? "1 receiver" : `${count} receivers`;
}

export function formatLatencyChip(streamLive: boolean, latencyMs: number | undefined): string {
  if (!streamLive || latencyMs == null) {
    return `${EM_DASH} ms`;
  }
  return `${latencyMs} ms`;
}

export function formatFpsChip(streamLive: boolean, frameRate: number | undefined): string {
  if (!streamLive || frameRate == null) {
    return `${EM_DASH} fps`;
  }
  return `${frameRate} fps`;
}
