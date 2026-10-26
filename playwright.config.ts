import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const databaseUrl = new URL(
  process.env.DATABASE_URL ?? 'postgresql://app@127.0.0.1:55432/student_marketplace',
);
const testDatabaseName =
  process.env.E2E_DATABASE_NAME ?? 'student_marketplace_e2e_ui_' + randomBytes(6).toString('hex');
if (!/^student_marketplace_e2e(?:_ui_[a-f0-9]{12})?$/.test(testDatabaseName))
  throw new Error('Invalid isolated E2E database name.');
process.env.E2E_DATABASE_NAME = testDatabaseName;
databaseUrl.pathname = '/' + testDatabaseName;
process.env.DATABASE_URL = databaseUrl.toString();
process.env.BETTER_AUTH_URL = baseURL;
process.env.LOCAL_DEV_MODE = 'true';
process.env.DEMO_ENABLED = 'true';
// Tests must never inherit the owner's live provider token or issue billable/external calls.
process.env.THREADS_SEARCH_ENABLED = 'false';
process.env.THREADS_ACCESS_TOKEN = '';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium' }],
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : {
        command: 'node scripts/test-db.mjs && npm run start -- --port 3100',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
