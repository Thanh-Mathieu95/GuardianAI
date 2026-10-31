import { defineConfig } from "@playwright/test";
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
export default defineConfig({
  testDir: "./tests",
  testMatch: "ui.spec.ts",
  workers: 1,
  globalTimeout: 180000,
  use: {
    baseURL: "http://127.0.0.1:3132",
    headless: false,
    channel: "msedge",
    launchOptions: { timeout: 15000 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3132",
    url: "http://127.0.0.1:3132/api/health",
    reuseExistingServer: false,
    env: {
      AI_ENABLED: "false",
      OPENAI_API_KEY: "",
      DATABASE_PATH: ":memory:",
      DATABASE_URL: "",
      PUBLIC_URL: "",
      SESSION_SECRET: "isolated-playwright-test-session-secret-2026",
    },
  },
});
