import { expect, test } from "@playwright/test";
import { WebSocket } from "ws";
import { AppServer } from "../electron/server/appServer";

test("receiver page loads and waits for the host stream", async ({ page }) => {
  const server = await AppServer.start();
  const url = localReceiverUrl(server.session.receiverUrl);

  await page.goto(url);

  await expect(page.locator("video#screen")).toBeAttached();
  await expect(page.locator("#status")).toHaveText(/Connecting|Waiting for stream/i);

  await server.stop();
});

test("receiver page reports reconnecting after server closes", async ({ page }) => {
  const server = await AppServer.start();
  const url = localReceiverUrl(server.session.receiverUrl);

  await page.goto(url);
  await expect(page.locator("#status")).toHaveText(/Connecting|Waiting for stream/i);
  await server.stop();

  await expect(page.locator("#status")).toHaveText(/Reconnecting|Error/i);
});

test("receiver negotiates when the host starts after the receiver", async ({ page }) => {
  const server = await AppServer.start();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(localReceiverUrl(server.session.receiverUrl));
  await expect(page.locator("#status")).toHaveText("Waiting for stream");

  const host = new WebSocket(
    `${localReceiverUrl(server.session.wsUrl)}?role=host&token=${server.session.hostToken}`
  );
  const messages: Array<{ type: string; receiverId?: string; data?: unknown }> = [];
  host.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  await waitForOpen(host);
  await waitFor(() => messages.some((message) => message.type === "receiver-joined"));
  const receiverId = messages.find((message) => message.type === "receiver-joined")?.receiverId;
  expect(receiverId).toBeTruthy();

  host.send(JSON.stringify({ type: "host-ready", target: "receiver", receiverId }));
  await waitFor(() => messages.some((message) => message.type === "signal"));
  await expect(page.locator("#status")).toHaveText(/Negotiating|checking|new|connected/i);

  host.send(JSON.stringify({
    type: "signal",
    target: "receiver",
    receiverId,
    data: { type: "ice", candidate: { candidate: "candidate:1 1 UDP 1 127.0.0.1 9 typ host" } }
  }));
  await page.waitForTimeout(100);
  expect(pageErrors).toEqual([]);

  host.close();
  await server.stop();
});

test("invalid receiver token returns 404", async ({ page }) => {
  const server = await AppServer.start();
  const url = new URL(localReceiverUrl(server.session.receiverUrl));
  url.pathname = "/r/not-the-token";

  const response = await page.goto(url.toString());

  expect(response?.status()).toBe(404);
  await expect(page.locator("body")).toContainText("Unknown session");
  await server.stop();
});

test("tv join page redirects with the displayed code", async ({ page }) => {
  const server = await AppServer.start();
  const tvUrl = localReceiverUrl(server.session.tvUrl);

  await page.goto(tvUrl);
  await expect(page.getByRole("heading", { name: "StoryDesk" })).toBeVisible();
  await expect(page.getByText("Find the code in the StoryDesk app")).toBeVisible();

  const responsePromise = page.waitForURL(new RegExp(`/r/${server.session.token}$`));
  await page.getByPlaceholder("CODE").fill(server.session.joinCode.toLowerCase());
  await page.getByRole("button", { name: "Connect" }).click();
  await responsePromise;

  await expect(page.locator("video#screen")).toBeAttached();
  await server.stop();
});

test("direct short join URL redirects to the receiver", async ({ page }) => {
  const server = await AppServer.start();
  const joinUrl = localReceiverUrl(server.session.joinUrl);

  await page.goto(joinUrl);

  await expect(page).toHaveURL(new RegExp(`/r/${server.session.token}$`));
  await server.stop();
});

test("tv join compatibility mode opens the fallback receiver", async ({ page }) => {
  const server = await AppServer.start();
  const tvUrl = localReceiverUrl(server.session.tvUrl);

  await page.goto(tvUrl);
  const responsePromise = page.waitForURL(new RegExp(`/fallback/${server.session.token}$`), {
    waitUntil: "domcontentloaded"
  });
  await page.getByPlaceholder("CODE").fill(server.session.joinCode);
  await page.getByRole("button", { name: "Compatibility" }).click();
  await responsePromise;

  await expect(page.locator("img#screen")).toBeAttached();
  await expect(page.locator("#status")).toHaveText(/Waiting|Live|Reconnecting|Offline/i);
  await server.stop();
});

function localReceiverUrl(receiverUrl: string) {
  const url = new URL(receiverUrl);
  url.hostname = "127.0.0.1";
  return url.toString();
}

function waitForOpen(ws: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

async function waitFor(assertion: () => boolean, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}
