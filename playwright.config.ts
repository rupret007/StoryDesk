import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 15_000,
  use: {
    ...devices["Desktop Chrome"]
  }
});
