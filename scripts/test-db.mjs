import 'dotenv/config';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
const url = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname))
  throw new Error('E2E разрешены только на локальной БД.');
const name = process.env.E2E_DATABASE_NAME ?? 'student_marketplace_e2e';
if (!/^student_marketplace_e2e(?:_ui_[a-f0-9]{12})?$/.test(name))
  throw new Error('Invalid isolated E2E database name.');
url.pathname = '/' + name;
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const connection = new pg.Client({ connectionString: adminUrl.toString() });
await connection.connect();
if (!(await connection.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
  await connection.query('CREATE DATABASE "' + name + '"');
await connection.end();
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  LOCAL_DEV_MODE: 'true',
  DEMO_ENABLED: 'true',
};
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  ['--import', 'tsx', 'prisma/seed.ts'],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Изолированная БД E2E подготовлена.');
