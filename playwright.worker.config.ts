import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  testMatch:'worker-security.spec.ts',
  timeout:180_000,
  retries:0,
  workers:1,
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:8788',acceptDownloads:true},
  webServer:{
    command:'npx wrangler dev --local --port 8788 --ip 127.0.0.1',
    url:'http://127.0.0.1:8788/api/health',
    reuseExistingServer:!process.env.CI,
    timeout:120_000,
  },
  reporter:'list',
});
