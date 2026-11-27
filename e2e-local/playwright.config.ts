import { defineConfig, devices } from '@playwright/test';

// Local end-to-end safety net (see docs/e2e.md, "Local suite").
// Runs against the production build served by `vite preview`, with every
// /api request answered in the browser from fixture JSON (e2e-local/mock-api.ts):
// no network, no live database, no test account. `npm run e2e:local` builds
// first; this config only serves dist/.

const PORT = Number(process.env.E2E_LOCAL_PORT || 4179);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.report' }]],
  outputDir: '.results',
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/`,
    // Never reuse by default: another worktree's preview on the same port
    // would serve ITS build to these tests. A busy port fails loudly;
    // set E2E_LOCAL_PORT, or E2E_REUSE_SERVER=1 to reuse on purpose.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 60_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The PWA service worker would answer requests itself and hide them
    // from the route mocks.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    // Same zone as this Node process: the fixtures' "today" must be the page's today.
    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: 'en-GB',
  },
  projects: [
    { name: 'phone-390', use: { ...devices['iPhone 15'], browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
});
