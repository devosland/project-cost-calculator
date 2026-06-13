import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * E2E config. Two webServers are brought up for the run:
 *   1. the Express API on port 3100 (port 3000 is commonly squatted on dev
 *      machines), pointed at a FRESH throwaway SQLite database so tests never
 *      touch dev data;
 *   2. the Vite dev server on 5173, proxying /api to 3100.
 *
 * Environment is passed through each webServer's `env` block (not a shell
 * prefix) so the commands work identically on Windows, macOS and Linux.
 */
const TEST_DB_DIR = path.join(os.tmpdir(), `pcc-e2e-${Date.now()}`);
fs.mkdirSync(TEST_DB_DIR, { recursive: true });
// Exposed to global-teardown.js so it can remove the throwaway DB after the run.
process.env.PCC_E2E_DB_DIR = TEST_DB_DIR;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  globalTeardown: './tests/e2e/global-teardown.js',
  fullyParallel: false,
  // SQLite is a single writer — one worker avoids cross-test DB contention.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // Force the browser language so the app's navigator.language locale
    // detection resolves to French (FR-CA is the primary UI); otherwise
    // headless Chromium defaults to en-US and the French selectors miss.
    locale: 'fr-CA',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    // reuseExistingServer: false everywhere — always boot fresh servers. A stale
    // dev server left on 5173/3100 would otherwise be silently reused and mask
    // code changes; with strictPort, a real port clash now fails loudly instead.
    {
      command: 'node server/index.js',
      url: 'http://localhost:3100/api/health',
      env: { DATA_DIR: TEST_DB_DIR, PORT: '3100' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      url: 'http://localhost:5173',
      env: { VITE_API_PROXY: 'http://127.0.0.1:3100' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
