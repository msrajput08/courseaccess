import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',
  testMatch:'account.spec.ts',
  timeout:90_000,
  retries:0,
  workers:1,
  use:{...devices['Desktop Chrome'],baseURL:'http://localhost:8789',acceptDownloads:true},
  webServer:{
    command:'npx wrangler d1 migrations apply DB --local --config wrangler.auth.test.jsonc && npx wrangler dev --local --config wrangler.auth.test.jsonc --port 8789 --ip 127.0.0.1',
    url:'http://localhost:8789/api/health',
    reuseExistingServer:!process.env.CI,
    timeout:120_000
  },
  reporter:'list'
});
