import { defineConfig, devices } from '@playwright/test';

/** Browser tests against the URL published by Wrangler, never the Vite dev server. */
const baseURL = process.env.COURSEACCESS_URL?.replace(/\/$/, '');
if (!baseURL) throw new Error('COURSEACCESS_URL must be set to a verified deployment URL.');

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/live.spec.ts',
  fullyParallel: false,
  timeout: 45_000,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: 'test-results/live',
  projects: [
    { name: 'live-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'live-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
