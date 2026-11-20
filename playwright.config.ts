import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The tests run their own backend and dashboard, on a fresh database,
// so they never touch the dev servers or their data.
const database = join(tmpdir(), `undercover-e2e-${String(Date.now())}.db`);

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/test-results",
  reporter: "list",
  use: { baseURL: "http://localhost:5174" },
  webServer: [
    {
      command: "uv run -m uvicorn backend.main:app --port 8001",
      url: "http://127.0.0.1:8001/api/health",
      env: { DATABASE_PATH: database },
      reuseExistingServer: false,
    },
    {
      command: "npx vite dashboard --port 5174 --strictPort",
      url: "http://localhost:5174",
      env: { BACKEND_URL: "http://127.0.0.1:8001" },
      reuseExistingServer: false,
    },
  ],
});
