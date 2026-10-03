import { defineConfig, devices } from "@playwright/test";

const PORT = 3120;

/**
 * Smoke tests against the production build. Run `npm run build` first;
 * CI does that in the e2e job before calling `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/pt-BR`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
