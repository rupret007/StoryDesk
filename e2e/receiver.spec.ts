import { expect, test } from "@playwright/test";
import { AppServer } from "../electron/server/appServer";

test("receiver page loads and enters negotiation", async ({ page }) => {
  const server = await AppServer.start();
  const url = localReceiverUrl(server.session.receiverUrl);

  await page.goto(url);

  await expect(page.locator("video#screen")).toBeAttached();
  await expect(page.locator("#status")).toHaveText(/Connecting|Negotiating|checking|new|connected/i);

  await server.stop();
});

test("receiver page reports reconnecting after server closes", async ({ page }) => {
  const server = await AppServer.start();
  const url = localReceiverUrl(server.session.receiverUrl);

  await page.goto(url);
  await expect(page.locator("#status")).toHaveText(/Connecting|Negotiating|checking|new|connected/i);
  await server.stop();

  await expect(page.locator("#status")).toHaveText(/Reconnecting|Error/i);
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
