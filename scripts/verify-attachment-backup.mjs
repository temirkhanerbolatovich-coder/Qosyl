import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

const isolatedName = /^student_marketplace_e2e_attachments_[a-f0-9]{12}$/;
const identifier = (name) => '"' + name.replaceAll('"', '""') + '"';

function requireIsolated(database) {
  if (
    !['postgresql:', 'postgres:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    !isolatedName.test(database.pathname.slice(1)) ||
    database.search ||
    database.hash
  )
    throw Error('Attachment restore verification requires an isolated loopback test database.');
}

function connection(database) {
  return new pg.Client({
    connectionString: database.toString(),
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    options: '-c timezone=UTC',
  });
}

function runPostgres(tool, args, database) {
  requireIsolated(database);
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
    timeout: 120_000,
  });
  if (result.status !== 0)
    throw Error(`Isolated attachment ${tool} did not complete; connection details are withheld.`);
}

async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Hash metadata and actual bytea, one bounded attachment at a time, plus immutable delivery links. */
async function fingerprint(client) {
  const attachments = await client.query(
    'SELECT id, sha256, "byteSize", (to_jsonb(a) - \'bytes\')::text AS metadata FROM "ProjectAttachment" a ORDER BY id COLLATE "C"',
  );
  const hash = createHash('sha256');
  let byteCount = 0;
  for (const attachment of attachments.rows) {
    const result = await client.query('SELECT bytes FROM "ProjectAttachment" WHERE id = $1', [
      attachment.id,
    ]);
    const bytes = result.rows[0]?.bytes;
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.byteLength !== attachment.byteSize ||
      createHash('sha256').update(bytes).digest('hex') !== attachment.sha256
    )
      throw Error('Isolated attachment bytes do not match their stored size and digest.');
    byteCount += bytes.byteLength;
    hash.update(attachment.metadata + '\n');
    hash.update(bytes);
    hash.update('\n');
  }
  const links = await client.query(
    'SELECT to_jsonb(s)::text AS metadata FROM "SubmissionAttachment" s ORDER BY "submissionId" COLLATE "C", "attachmentId" COLLATE "C"',
  );
  for (const link of links.rows) hash.update(link.metadata + '\n');
  return {
    attachments: attachments.rowCount,
    links: links.rowCount,
    byteCount,
    sha256: hash.digest('hex'),
  };
}

/** Verify only the synthetic database created by the attachment test harness; never restore over it. */
export async function verifyAttachmentBackup(input) {
  const database = new URL(input);
  requireIsolated(database);
  const name = 'student_marketplace_e2e_attachments_' + randomBytes(6).toString('hex');
  if (name === database.pathname.slice(1)) throw Error('Distinct restore database required.');
  const restoreDatabase = new URL(database);
  restoreDatabase.pathname = '/' + name;
  requireIsolated(restoreDatabase);
  const adminDatabase = new URL(database);
  adminDatabase.pathname = '/postgres';
  const source = connection(database);
  const admin = connection(adminDatabase);
  const restored = connection(restoreDatabase);
  let created = false;
  let verified = false;
  const directory = path.resolve('.local', 'f05-attachment-backups', name);
  const archive = path.join(directory, 'attachments.dump');
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await source.connect();
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await source.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
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
    const expected = await fingerprint(source);
    if (!expected.attachments || !expected.links || !expected.byteCount)
      throw Error('A populated attachment and delivery-link fixture is required.');
    await source.query('COMMIT');
    const archiveSha256 = await fileHash(archive);
    await admin.connect();
    await admin.query(`CREATE DATABASE ${identifier(name)} TEMPLATE template0`);
    created = true;
    runPostgres(
      'pg_restore',
      [
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '--single-transaction',
        `--dbname=${name}`,
        archive,
      ],
      restoreDatabase,
    );
    await restored.connect();
    const actual = await fingerprint(restored);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error('Restored synthetic attachment bytes, metadata or submission links differ.');
    const evidence = { verified: true, ...actual, archiveSha256 };
    await writeFile('.local/f05-attachment-restore.json', JSON.stringify(evidence, null, 2), {
      mode: 0o600,
    });
    verified = true;
    console.log('Isolated attachment backup/restore verified: ' + JSON.stringify(evidence));
    return evidence;
  } finally {
    await source.end();
    await restored.end();
    if (created && verified) await admin.query(`DROP DATABASE ${identifier(name)}`);
    else if (created) console.error('Isolated attachment restore database retained: ' + name);
    await admin.end();
  }
}
