import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',
  testIgnore:['**/live.spec.ts','**/pdfua-export.spec.ts','**/worker-security.spec.ts','**/account.spec.ts','**/real-corpus.spec.ts','**/external-corpus.spec.ts'],
  fullyParallel:true,
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'mobile-chromium',use:{...devices['Pixel 7']}}],
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:120_000},
});
