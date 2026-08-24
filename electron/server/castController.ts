import { Bonjour } from "bonjour-service";
import { normalizeCastService } from "../lib/castDevices";
import type { CastDevice, Session } from "../lib/types";
import type { CastStreamHub } from "./castStreamHub";

type CastClient = {
  connect(host: string, callback: (error?: Error) => void): void;
  launch(receiver: unknown, callback: (error: Error | null, player: CastPlayer) => void): void;
  close(): void;
};

type CastPlayer = {
  load(media: unknown, options: unknown, callback: (error?: Error) => void): void;
  stop(callback?: () => void): void;
};

export class CastController {
  private readonly bonjour = new Bonjour();
  private readonly devices = new Map<string, CastDevice>();
  private browser: ReturnType<Bonjour["find"]> | null = null;
  private client: CastClient | null = null;
  private player: CastPlayer | null = null;

  constructor(
    private readonly session: Session,
    private readonly streams: CastStreamHub
  ) {}

  discover(timeoutMs = 2200) {
    this.devices.clear();
    this.browser?.stop();
    this.browser = this.bonjour.find({ type: "googlecast" }, (service) => {
      const device = normalizeCastService(service);
      if (device) {
        this.devices.set(device.id, device);
      }
    });

    return new Promise<CastDevice[]>((resolve) => {
      setTimeout(() => resolve([...this.devices.values()]), timeoutMs);
    });
  }

  async connect(deviceId: string) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error("Cast device not found");
    }

    await this.disconnect();
    this.streams.reset(this.session.token);
    const castv2 = require("castv2-client") as {
      Client: new () => CastClient;
      DefaultMediaReceiver: unknown;
    };
    const client = new castv2.Client();
    this.client = client;

    await new Promise<void>((resolve, reject) => {
      client.connect(device.host, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const player = await new Promise<CastPlayer>((resolve, reject) => {
      client.launch(castv2.DefaultMediaReceiver, (error, launchedPlayer) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(launchedPlayer);
      });
    });
    this.player = player;

    const media = {
      contentId: this.session.castUrl,
      contentType: "video/webm; codecs=vp8",
      streamType: "LIVE",
      metadata: {
        type: 0,
        metadataType: 0,
        title: "StoryDesk Virtual Display"
      }
    };

    await new Promise<void>((resolve, reject) => {
      player.load(media, { autoplay: true }, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async disconnect() {
    this.player?.stop?.();
    this.player = null;
    this.client?.close();
    this.client = null;
  }
}
