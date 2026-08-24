import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import type { VirtualDisplayConfig } from "../lib/types";

export class VirtualDisplayHelper {
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly onEvent: (event: unknown) => void) {}

  async start(config: VirtualDisplayConfig) {
    const child = this.ensureChild();
    child.stdin.write(JSON.stringify({ command: "start", config }) + "\n");
  }

  async stop() {
    this.child?.stdin.write(JSON.stringify({ command: "stop" }) + "\n");
  }

  async shutdown() {
    if (!this.child) {
      return;
    }
    this.child.stdin.write(JSON.stringify({ command: "shutdown" }) + "\n");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 500);
      this.child?.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.child?.kill();
    this.child = null;
  }

  private ensureChild() {
    if (this.child && !this.child.killed) {
      return this.child;
    }

    const helperPath = resolveHelperPath();
    const child = spawn(helperPath, [], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;

    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on("line", (line) => {
      try {
        this.onEvent(JSON.parse(line));
      } catch {
        this.onEvent({ type: "error", message: line });
      }
    });

    const stderr = readline.createInterface({ input: child.stderr });
    stderr.on("line", (line) => {
      this.onEvent({ type: "error", message: line });
    });

    child.on("exit", (code) => {
      this.onEvent({ type: "terminated", code });
      if (this.child === child) {
        this.child = null;
      }
    });

    child.on("error", (error) => {
      this.onEvent({ type: "error", message: error.message });
    });

    return child;
  }
}

function resolveHelperPath() {
  const devPath = path.join(process.cwd(), "dist-helper", "StoryDeskVirtualDisplayHelper");
  const packagedPath = path.join(
    process.resourcesPath,
    "dist-helper",
    "StoryDeskVirtualDisplayHelper"
  );
  return process.env.NODE_ENV === "production" ? packagedPath : devPath;
}
