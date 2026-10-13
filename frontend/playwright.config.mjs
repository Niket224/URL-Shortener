import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  testDir: "./tests",
  outputDir: path.join(os.tmpdir(), "snip-playwright-results"),
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5179", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], permissions: ["clipboard-read", "clipboard-write"] } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] } },
  ],
  webServer: [
    { command: "node ../backend/src/index.js", url: "http://127.0.0.1:5101/api/health", reuseExistingServer: false,
      env: { NODE_ENV: "test", AUTH_MODE: "accounts", MONGODB_URI: "", VERCEL: "", PORT: "5101", BASE_URL: "http://127.0.0.1:5101", FRONTEND_URL: "http://127.0.0.1:5179" } },
    { command: "npm run dev -- --host 127.0.0.1 --port 5179 --strictPort", url: "http://127.0.0.1:5179", reuseExistingServer: false,
      env: { VITE_API_URL: "", API_PROXY_TARGET: "http://127.0.0.1:5101" } },
  ],
});
