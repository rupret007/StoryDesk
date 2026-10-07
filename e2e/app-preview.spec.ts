import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { expect, test } from "@playwright/test";

let vite: ChildProcessWithoutNullStreams;

test.beforeAll(async () => {
  vite = spawn(
    "npx",
    ["vite", "--host", "127.0.0.1", "--port", "5174", "--strictPort"],
    {
      cwd: process.cwd(),
      stdio: "pipe"
    }
  );
  await waitForUrl("http://127.0.0.1:5174/");
});

test.afterAll(() => {
  vite?.kill();
});

test("app renders safely outside Electron", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("http://127.0.0.1:5174/");

  await expect(page.getByRole("heading", { name: "StoryDesk" })).toBeVisible();
  await expect(page.getByRole("main", { name: "StoryDesk" })).toBeVisible();
  await expect(page.locator(".notice-band")).toContainText("Browser preview mode");
  await expect(page.getByRole("button", { name: "Start virtual display" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Start stream" })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Capture source" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

async function waitForUrl(url: string, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
