import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseEnv } from 'node:util';

const root = process.cwd();
const local = path.join(root, '.local');
const data = path.join(local, 'postgres');
mkdirSync(local, { recursive: true });
const bin =
  process.env.POSTGRES_BIN ||
  (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const executable = (name) =>
  bin ? path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
function run(name, args, options = {}) {
  const result = spawnSync(executable(name), args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(`${name}: ${result.stderr || result.stdout || result.error}`);
  return result.stdout;
}
if (process.argv[2] === 'stop') {
  if (existsSync(path.join(data, 'postmaster.pid')))
    run('pg_ctl', ['-D', data, '-m', 'fast', 'stop']);
  console.log('Локальный PostgreSQL остановлен; данные сохранены.');
  process.exit(0);
}
const envPath = path.join(root, '.env');
if (!existsSync(envPath)) {
  const password = randomBytes(24).toString('hex');
  writeFileSync(
    envPath,
    `DATABASE_URL=postgresql://marketplace:${password}@127.0.0.1:55432/student_marketplace\nBETTER_AUTH_SECRET=${randomBytes(48).toString('hex')}\nBETTER_AUTH_URL=http://localhost:3000\nLOCAL_DEV_MODE=true\nDEMO_ENABLED=true\n`,
    { mode: 0o600 },
  );
}
const env = parseEnv(readFileSync(envPath, 'utf8'));
const url = new URL(env.DATABASE_URL);
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55432' ||
  url.pathname !== '/student_marketplace'
) {
  throw new Error(
    'db:local работает только с изолированной БД 127.0.0.1:55432/student_marketplace. Для внешней БД используйте db:migrate.',
  );
}
if (!existsSync(path.join(data, 'PG_VERSION'))) {
  const pwFile = path.join(local, 'postgres-password');
  writeFileSync(pwFile, decodeURIComponent(url.password), { mode: 0o600 });
  run('initdb', [
    '-D',
    data,
    '-U',
    url.username,
    '--auth-local=trust',
    '--auth-host=scram-sha-256',
    '--pwfile',
    pwFile,
    '--encoding=UTF8',
    '--locale=C',
  ]);
}
const status = spawnSync(executable('pg_ctl'), ['-D', data, 'status'], {
  encoding: 'utf8',
  windowsHide: true,
});
if (status.status !== 0)
  run(
    'pg_ctl',
    [
      '-D',
      data,
      '-l',
      path.join(local, 'postgres.log'),
      '-o',
      '-h 127.0.0.1 -p 55432',
      '-w',
      'start',
    ],
    { stdio: 'ignore' },
  );
const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const existing = run(
  'psql',
  [
    '-h',
    '127.0.0.1',
    '-p',
    '55432',
    '-U',
    url.username,
    '-d',
    'postgres',
    '-tAc',
    "SELECT 1 FROM pg_database WHERE datname='student_marketplace'",
  ],
  { env: pgEnv },
);
if (existing.trim() !== '1')
  run('createdb', ['-h', '127.0.0.1', '-p', '55432', '-U', url.username, 'student_marketplace'], {
    env: pgEnv,
  });
console.log(
  'PostgreSQL готов: 127.0.0.1:55432/student_marketplace. Существующие данные сохранены. Секреты в .env.',
);
