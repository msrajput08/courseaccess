import {defineConfig,devices} from '@playwright/test';

const baseURL=process.env.COURSEACCESS_URL?.replace(/\/$/,'');
const expected='https://courseaccess.minty-12-shar.workers.dev';
if(baseURL!==expected)throw new Error('Live auth tests are restricted to the owner-approved workers.dev domain.');

export default defineConfig({
  testDir:'./e2e',testMatch:'**/live-account.spec.ts',
  workers:1,retries:0,timeout:90_000,
  use:{...devices['Desktop Chrome'],baseURL,acceptDownloads:true,
    trace:'retain-on-failure',screenshot:'only-on-failure'},
  outputDir:'test-results/live-auth',reporter:'list',
});
