import type { Session, StreamSettings } from "../types";
import { getStoryDeskBridge } from "./desktopBridge";

const maxFallbackWidth = 1280;
const maxFallbackHeight = 720;
const fallbackJpegQuality = 0.72;

export class FallbackFramePublisherService {
  private readonly bridge = getStoryDeskBridge();
  private canvas: HTMLCanvasElement | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: number | null = null;
  private publishing = false;
  private generation = 0;

  async start(stream: MediaStream, session: Session, settings: StreamSettings) {
    this.stop();
    const generation = this.generation;
    await this.bridge.receiver.resetFallbackStream(session.token);
    if (generation !== this.generation) {
      return;
    }

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    this.video = video;
    this.canvas = document.createElement("canvas");

    await video.play().catch(() => undefined);

    const fps = Math.max(1, Math.min(12, settings.fps));
    this.timer = window.setInterval(
      () => void this.publishFrame(session.token, settings, generation),
      Math.round(1000 / fps)
    );
    void this.publishFrame(session.token, settings, generation);
  }

  stop() {
    this.generation += 1;
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    this.canvas = null;
    this.publishing = false;
  }

  private async publishFrame(
    token: string,
    settings: StreamSettings,
    generation: number
  ) {
    if (
      generation !== this.generation ||
      this.publishing ||
      !this.video ||
      !this.canvas ||
      this.video.readyState < 2
    ) {
      return;
    }

    const sourceWidth = this.video.videoWidth || settings.width;
    const sourceHeight = this.video.videoHeight || settings.height;
    const { width, height } = fitWithin(sourceWidth, sourceHeight);
    this.canvas.width = width;
    this.canvas.height = height;

    const context = this.canvas.getContext("2d", { alpha: false });
    if (!context) {
      return;
    }

    context.drawImage(this.video, 0, 0, width, height);
    this.publishing = true;
    this.canvas.toBlob(
      async (blob) => {
        try {
          if (blob && generation === this.generation) {
            this.bridge.receiver.publishFallbackFrame(token, await blob.arrayBuffer());
          }
        } finally {
          if (generation === this.generation) {
            this.publishing = false;
          }
        }
      },
      "image/jpeg",
      fallbackJpegQuality
    );
  }
}

function fitWithin(sourceWidth: number, sourceHeight: number) {
  const scale = Math.min(
    1,
    maxFallbackWidth / Math.max(1, sourceWidth),
    maxFallbackHeight / Math.max(1, sourceHeight)
  );
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}
