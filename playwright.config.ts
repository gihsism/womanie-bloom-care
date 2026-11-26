import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke suite for the critical patient flows (see docs/e2e.md).
// Runs against a deployed site — E2E_BASE_URL, default production — and is
// deliberately NOT part of `npm run build` or vitest.
//
// One worker, files in order: every test shares the ux-review test account,
// so two tests switching its life stage at once would trip over each other.

export const BASE_URL = (process.env.E2E_BASE_URL || 'https://womanie.info').replace(/\/$/, '');

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  globalSetup: './e2e/global-setup.ts',
  // CI only: logs every session out at the end (report artifacts are public).
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  outputDir: 'e2e/.results',
  use: {
    baseURL: BASE_URL,
    // The password is typed only in global-setup, which is never traced,
    // so traces/screenshots cannot contain it.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'iphone',
      // iPhone 15 viewport, touch and user agent, rendered in Chromium.
      use: { ...devices['iPhone 15'], browserName: 'chromium', storageState: 'e2e/.auth/iphone.json' },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/desktop.json' },
    },
  ],
});
