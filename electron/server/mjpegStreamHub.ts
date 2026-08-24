import type { Response } from "express";

const boundary = "storydesk-frame";

type Subscriber = {
  response: Response;
};

export class MjpegStreamHub {
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly latestFrames = new Map<string, Buffer>();

  reset(token: string) {
    this.latestFrames.delete(token);
    const subscribers = this.subscribers.get(token);
    subscribers?.forEach(({ response }) => response.end());
    this.subscribers.delete(token);
  }

  subscribe(token: string, response: Response) {
    response.writeHead(200, {
      "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    const subscriber = { response };
    if (!this.subscribers.has(token)) {
      this.subscribers.set(token, new Set());
    }
    this.subscribers.get(token)?.add(subscriber);

    const latestFrame = this.latestFrames.get(token);
    if (latestFrame) {
      writeFrame(response, latestFrame);
    }

    response.on("close", () => {
      this.subscribers.get(token)?.delete(subscriber);
    });
  }

  publish(token: string, frame: Buffer) {
    this.latestFrames.set(token, frame);
    this.subscribers.get(token)?.forEach(({ response }) => {
      writeFrame(response, frame);
    });
  }
}

function writeFrame(response: Response, frame: Buffer) {
  response.write(`--${boundary}\r\n`);
  response.write("Content-Type: image/jpeg\r\n");
  response.write(`Content-Length: ${frame.length}\r\n\r\n`);
  response.write(frame);
  response.write("\r\n");
}
