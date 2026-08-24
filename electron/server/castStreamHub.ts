import type { Response } from "express";

type Subscriber = {
  response: Response;
};

export class CastStreamHub {
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly firstChunks = new Map<string, Buffer>();

  reset(token: string) {
    this.firstChunks.delete(token);
    const subscribers = this.subscribers.get(token);
    subscribers?.forEach(({ response }) => response.end());
    this.subscribers.delete(token);
  }

  subscribe(token: string, response: Response) {
    response.writeHead(200, {
      "Content-Type": "video/webm; codecs=vp8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
      "Access-Control-Allow-Origin": "*"
    });

    const subscriber = { response };
    if (!this.subscribers.has(token)) {
      this.subscribers.set(token, new Set());
    }
    this.subscribers.get(token)?.add(subscriber);

    const firstChunk = this.firstChunks.get(token);
    if (firstChunk) {
      response.write(firstChunk);
    }

    response.on("close", () => {
      this.subscribers.get(token)?.delete(subscriber);
    });
  }

  publish(token: string, chunk: Buffer) {
    if (!this.firstChunks.has(token)) {
      this.firstChunks.set(token, chunk);
    }
    this.subscribers.get(token)?.forEach(({ response }) => {
      response.write(chunk);
    });
  }
}
