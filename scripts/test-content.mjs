import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/student_marketplace')
  throw new Error('Explicit local pilot database required.');
const name = 'student_marketplace_e2e_content_' + randomBytes(6).toString('hex');
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
let success = false;
try {
  await admin.query('CREATE DATABASE "' + name + '"');
  url.pathname = '/' + name;
  const env = { ...process.env, DATABASE_TEST_URL: url.toString(), DATABASE_URL: url.toString() };
  const migration = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env, stdio: 'inherit', windowsHide: true },
  );
  if (migration.status !== 0) throw Error('Isolated content test migration failed.');
  const result = spawnSync(
    process.execPath,
    [
      '--conditions=react-server',
      '--import',
      'tsx',
      '--test',
      '--test-concurrency=1',
      'tests/content-fetch-http.integration.mts',
      'tests/content-intake.integration.mts',
      'tests/content-publication.integration.mts',
      'tests/opportunity-discovery.integration.mts',
    ],
    { env, stdio: 'inherit', windowsHide: true },
  );
  success = result.status === 0;
  process.exitCode = result.status ?? 1;
} finally {
  if (success) await admin.query('DROP DATABASE "' + name + '"');
  else console.error('Isolated diagnostic database retained: ' + name);
  await admin.end();
}
