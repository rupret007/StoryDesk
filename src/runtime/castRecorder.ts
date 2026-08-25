import type { Session, StreamSettings } from "../types";
import { getStoryDeskBridge } from "./desktopBridge";

export class CastRecorderService {
  private recorder: MediaRecorder | null = null;
  private readonly bridge = getStoryDeskBridge();
  private generation = 0;

  async start(stream: MediaStream, session: Session, settings: StreamSettings) {
    this.stop();
    const generation = this.generation;
    await this.bridge.cast.resetStream(session.token);
    if (generation !== this.generation) {
      return;
    }
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: settings.bitrateKbps * 1000
    });
    recorder.ondataavailable = async (event) => {
      if (event.data.size === 0) {
        return;
      }
      const chunk = await event.data.arrayBuffer();
      if (generation === this.generation) {
        this.bridge.cast.publishChunk(session.token, chunk);
      }
    };
    recorder.start(250);
    this.recorder = recorder;
  }

  stop() {
    this.generation += 1;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.stop();
    }
  }
}
