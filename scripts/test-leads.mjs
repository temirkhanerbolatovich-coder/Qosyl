import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const target = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(target.hostname))
  throw new Error('Local test database required.');
target.pathname = '/student_marketplace_e2e';
const result = spawnSync(
  process.execPath,
  [
    '--conditions=react-server',
    '--import',
    'tsx',
    '--test',
    '--test-concurrency=1',
    'tests/leads.integration.mts',
    'tests/threads.integration.mts',
  ],
  {
    env: { ...process.env, DATABASE_URL: target.toString(), DATABASE_TEST_URL: target.toString() },
    stdio: 'inherit',
    windowsHide: true,
  },
);
process.exitCode = result.status ?? 1;
