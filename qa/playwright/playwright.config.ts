// b37 H-4 (GOAL-LOCK #11): "Playwright passes 3 runs". One worker, each test repeated 3 times, Chromium at 1,366 px.
// Local:      BASE=http://localhost:3917 H4_EMAIL=… H4_PASSWORD=… npx playwright test -c qa/playwright
// Production: BASE=https://aetherforgeai.co.nz PW_STORAGE=/path/state.json (an allow-listed account's signed-in state)
// No password is stored in the repo; credentials come only from the environment.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  repeatEach: 3,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE || "http://localhost:3917",
    viewport: { width: 1366, height: 900 },
    storageState: process.env.PW_STORAGE || undefined,
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
});
