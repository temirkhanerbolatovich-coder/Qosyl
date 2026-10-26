import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Local test database required.');
url.pathname = '/student_marketplace_e2e';
const result = spawnSync(
  process.execPath,
  [
    '--conditions=react-server',
    '--import',
    'tsx',
    '--test',
    'tests/lifecycle-worker.integration.mts',
  ],
  {
    env: { ...process.env, DATABASE_TEST_URL: url.toString() },
    stdio: 'inherit',
    windowsHide: true,
  },
);
process.exitCode = result.status ?? 1;
