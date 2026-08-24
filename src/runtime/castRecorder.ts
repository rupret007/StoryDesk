import type { Session, StreamSettings } from "../types";
import { getStoryDeskBridge } from "./desktopBridge";

export class CastRecorderService {
  private recorder: MediaRecorder | null = null;
  private readonly bridge = getStoryDeskBridge();

  async start(stream: MediaStream, session: Session, settings: StreamSettings) {
    await this.bridge.cast.resetStream(session.token);
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
      this.bridge.cast.publishChunk(session.token, await event.data.arrayBuffer());
    };
    recorder.start(250);
    this.recorder = recorder;
  }

  stop() {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
    this.recorder = null;
  }
}
