import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  testMatch:'**/pdfua-export.spec.ts',
  fullyParallel:false,
  timeout:90_000,
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'validator-fixture',use:{...devices['Desktop Chrome']}}],
  webServer:{
    command:'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:!process.env.CI,timeout:120_000,
  },
  outputDir:'test-results/pdfua-export',
});
