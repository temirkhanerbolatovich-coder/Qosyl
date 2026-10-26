import 'dotenv/config';
import { spawnSync } from 'node:child_process';

// Tests only the isolated E2E database; never creates or migrates the application database.
const testUrl = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(testUrl.hostname)) {
  throw new Error('Проверки структуры разрешены только на локальной тестовой БД.');
}
testUrl.pathname = '/student_marketplace_e2e';
const result = spawnSync(
  process.execPath,
  [
    '--test',
    'tests/database-structure.test.mjs',
    'tests/pilot-database.test.mjs',
    'tests/lifecycle-database.test.mjs',
    'tests/content-database.test.mjs',
    'tests/leads-database.test.mjs',
  ],
  {
    env: { ...process.env, DATABASE_TEST_URL: testUrl.toString() },
    stdio: 'inherit',
    windowsHide: true,
  },
);
process.exitCode = result.status ?? 1;
