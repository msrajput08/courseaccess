import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  testMatch:'real-corpus.spec.ts',
  workers:2,
  retries:0,
  timeout:90_000,
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:4175',acceptDownloads:true},
  webServer:{
    command:'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
    url:'http://127.0.0.1:4175',
    reuseExistingServer:!process.env.CI,
    timeout:120_000,
  },
  reporter:'list',
});
