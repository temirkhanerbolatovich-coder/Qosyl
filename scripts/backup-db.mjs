import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import path from 'node:path';
import pg from 'pg';
import { localDemoSettings } from './local-demo-config.mjs';

process.umask(0o077);
const backupRoot = path.resolve('.local', 'backups');
const identifier = (name) => `"${name.replaceAll('"', '""')}"`;

async function archiveHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function runPostgres(tool, args, database) {
  // libpq service files and PGHOSTADDR can override a host or database selected by the caller.
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('PG')),
  );
  const bin =
    process.env.POSTGRES_BIN ||
    (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
  const executable = bin
    ? path.join(bin, tool + (process.platform === 'win32' ? '.exe' : ''))
    : tool;
  const result = spawnSync(executable, args, {
    env: {
      ...environment,
      PGHOST: database.hostname,
      PGPORT: database.port,
      PGUSER: decodeURIComponent(database.username),
      PGPASSWORD: decodeURIComponent(database.password),
      PGDATABASE: database.pathname.slice(1),
      PGCONNECT_TIMEOUT: '10',
    },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  });
  if (result.status !== 0) {
    throw new Error(
      `${tool}: операция не завершилась (код ${result.status ?? 'недоступен'}). Проверьте PostgreSQL 18, доступ и свободное место. Секреты и SQL-данные не выводятся.`,
    );
  }
}

async function fingerprints(connection) {
  await connection.query("SET TIME ZONE 'UTC'");
  const tables = await connection.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name COLLATE \"C\"",
  );
  const result = [];
  for (const { table_name: name } of tables.rows) {
    const records = await connection.query(
      `SELECT to_jsonb(record)::text AS value FROM public.${identifier(name)} AS record ORDER BY to_jsonb(record)::text COLLATE "C"`,
    );
    const hash = createHash('sha256');
    for (const record of records.rows) hash.update(record.value + '\n');
    result.push({ name, rows: records.rowCount, sha256: hash.digest('hex') });
  }
  return result;
}

function client(database) {
  return new pg.Client({
    connectionString: database.toString(),
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  });
}

async function createBackup(database) {
  const directory = path.join(
    backupRoot,
    new Date().toISOString().replaceAll(':', '-') + '-' + randomBytes(3).toString('hex'),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const source = client(database);
  try {
    await source.connect();
    // pg_dump and fingerprints must see the same data, even while the demo app is running.
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await source.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    const archive = path.join(directory, 'database.dump');
    runPostgres(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--no-acl',
        '--lock-wait-timeout=10000',
        `--snapshot=${snapshot}`,
        `--file=${archive}`,
      ],
      database,
    );
    const manifest = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      sourceDatabase: 'student_marketplace',
      archiveSha256: await archiveHash(archive),
      tables: await fingerprints(source),
    };
    await source.query('COMMIT');
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      mode: 0o600,
      flag: 'wx',
    });
    console.log(`Резервная копия: ${directory}`);
    console.log(`Таблиц: ${manifest.tables.length}; SHA256: ${manifest.archiveSha256}`);
    return directory;
  } finally {
    await source.end();
  }
}

async function verifyBackup(directory, database) {
  const resolvedRoot = await realpath(backupRoot);
  const resolvedDirectory = await realpath(directory);
  const relative = path.relative(resolvedRoot, resolvedDirectory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Проверять можно только собственную копию внутри .local/backups.');
  }
  const archive = await realpath(path.join(resolvedDirectory, 'database.dump'));
  if (path.dirname(archive) !== resolvedDirectory)
    throw new Error('Архив не должен быть ссылкой за пределы своей папки.');
  const manifest = JSON.parse(
    await readFile(path.join(resolvedDirectory, 'manifest.json'), 'utf8'),
  );
  if (
    manifest.formatVersion !== 1 ||
    manifest.sourceDatabase !== 'student_marketplace' ||
    !Array.isArray(manifest.tables) ||
    manifest.tables.length === 0
  ) {
    throw new Error('Неизвестный или пустой манифест резервной копии.');
  }
  if ((await archiveHash(archive)) !== manifest.archiveSha256) {
    throw new Error('SHA256 не совпадает: восстановление не начато.');
  }
  const verificationName = 'student_marketplace_restore_' + randomBytes(10).toString('hex');
  const adminUrl = new URL(database);
  adminUrl.pathname = '/postgres';
  const restoreUrl = new URL(database);
  restoreUrl.pathname = '/' + verificationName;
  const admin = client(adminUrl);
  let created = false;
  let verified = false;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${identifier(verificationName)} TEMPLATE template0`);
    created = true;
    runPostgres(
      'pg_restore',
      [
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '--single-transaction',
        `--dbname=${verificationName}`,
        archive,
      ],
      restoreUrl,
    );
    const restored = client(restoreUrl);
    try {
      await restored.connect();
      const actual = await fingerprints(restored);
      if (JSON.stringify(actual) !== JSON.stringify(manifest.tables)) {
        throw new Error('Восстановленная база не совпадает с отпечатками исходного snapshot.');
      }
      verified = true;
      await writeFile(
        path.join(resolvedDirectory, 'verification.json'),
        JSON.stringify(
          {
            verifiedAt: new Date().toISOString(),
            verified: true,
            archiveSha256: manifest.archiveSha256,
            tablesMatched: actual.length,
            rowsMatched: actual.reduce((sum, table) => sum + table.rows, 0),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      console.log(
        `Восстановление проверено: ${actual.length} таблиц, все SHA256 и числа строк совпали. Основная база не изменялась.`,
      );
    } finally {
      await restored.end();
    }
  } finally {
    // Only the exact disposable DB created by this invocation can be removed, after all clients close.
    try {
      if (created && verified) await admin.query(`DROP DATABASE ${identifier(verificationName)}`);
      if (created && !verified)
        console.error(`Проверочная база сохранена для диагностики: ${verificationName}`);
    } finally {
      await admin.end();
    }
  }
}

try {
  const args = process.argv.slice(2);
  if (!(
    args.length === 0 ||
    (args.length === 1 && args[0] === '--verify') ||
    (args.length === 2 && args[0] === '--check')
  )) {
    throw new Error(
      'Использование: npm run db:backup [-- --verify] или npm run db:backup -- --check <папка-копии>.',
    );
  }
  const { database } = localDemoSettings(parseEnv(await readFile('.env', 'utf8')));
  if (args[0] === '--check') await verifyBackup(args[1], database);
  else {
    const directory = await createBackup(database);
    if (args[0] === '--verify') await verifyBackup(directory, database);
  }
} catch (error) {
  // Driver errors can contain row values or connection details; only our own operational errors are shown.
  console.error(
    error?.constructor === Error
      ? error.message
      : 'Ошибка PostgreSQL при резервировании/проверке; исходная база не заменялась.',
  );
  process.exitCode = 1;
}
