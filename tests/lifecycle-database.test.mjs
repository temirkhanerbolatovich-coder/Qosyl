import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import pg from 'pg';

const databaseUrl = new URL(process.env.DATABASE_TEST_URL ?? 'invalid:');
if (
  !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) ||
  databaseUrl.pathname !== '/student_marketplace_e2e'
) {
  throw new Error('DATABASE_TEST_URL must explicitly select local student_marketplace_e2e.');
}
const connection = new pg.Client({
  connectionString: databaseUrl.toString(),
  options: '-c timezone=UTC',
});
before(() => connection.connect());
after(() => connection.end());

async function withFixture(run) {
  await connection.query('BEGIN');
  try {
    const ids = { user: randomUUID(), other: randomUUID(), project: randomUUID() };
    for (const id of [ids.user, ids.other]) {
      await connection.query(
        'INSERT INTO "User" (id, name, email, "updatedAt") VALUES ($1, $2, $3, now())',
        [id, 'Lifecycle database test', `${id}@example.test`],
      );
    }
    await connection.query(
      `INSERT INTO "Project" (id, "clientId", title, category, problem, description,
        deliverables, "acceptanceCriteria", "budgetKzt", "estimatedHours", "dueAt", "updatedAt")
       VALUES ($1, $2, 'Lifecycle database test', 'design', 'Test problem', 'Test description',
        'Test result', ARRAY['Test criterion'], 1000, 1, now() + interval '1 day', now())`,
      [ids.project, ids.user],
    );
    await run(ids);
  } finally {
    // All fixtures are rolled back, including retained delivery keys and append-only rows.
    await connection.query('ROLLBACK');
  }
}

async function rejectsSQL(sql, values, code, constraint) {
  await connection.query('SAVEPOINT rejected_write');
  try {
    await assert.rejects(connection.query(sql, values), (error) => {
      assert.equal(error.code, code);
      if (constraint) assert.equal(error.constraint, constraint);
      return true;
    });
  } finally {
    await connection.query('ROLLBACK TO SAVEPOINT rejected_write');
  }
}

async function notification(userId, dedupeKey = null) {
  const id = randomUUID();
  await connection.query(
    'INSERT INTO "Notification" (id, "userId", text, url, "dedupeKey") VALUES ($1, $2, $3, $4, $5)',
    [id, userId, 'Lifecycle reminder', '/dashboard', dedupeKey],
  );
  return id;
}

test('ordinary notifications retain nullable keys without an accidental one-per-user limit', () =>
  withFixture(async ({ user }) => {
    const first = await notification(user);
    const second = await notification(user);
    assert.notEqual(first, second);
    await connection.query('DELETE FROM "Notification" WHERE id=$1', [first]);
    const rows = await connection.query('SELECT id FROM "Notification" WHERE "userId"=$1', [user]);
    assert.deepEqual(rows.rows, [{ id: second }]);
  }));

test('a delivery key is globally unique and nonblank', () =>
  withFixture(async ({ user, other }) => {
    const key = `lifecycle:${randomUUID()}`;
    await notification(user, key);
    await rejectsSQL(
      'INSERT INTO "Notification" (id, "userId", text, url, "dedupeKey") VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), other, 'Duplicate reminder', '/dashboard', key],
      '23505',
      'Notification_dedupeKey_key',
    );
    await rejectsSQL(
      'INSERT INTO "Notification" (id, "userId", text, url, "dedupeKey") VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), user, 'Invalid key', '/dashboard', '   '],
      '23514',
      'Notification_valid_dedupe_key',
    );
  }));

test('marking an automatic notification read does not release its delivery key', () =>
  withFixture(async ({ user }) => {
    const key = `lifecycle:${randomUUID()}`;
    const id = await notification(user, key);
    await connection.query('UPDATE "Notification" SET "readAt"=now() WHERE id=$1', [id]);
    const rows = await connection.query(
      'SELECT "dedupeKey", "readAt" IS NOT NULL AS read FROM "Notification" WHERE id=$1',
      [id],
    );
    assert.deepEqual(rows.rows, [{ dedupeKey: key, read: true }]);
    await connection.query('UPDATE "Notification" SET "readAt"=NULL WHERE id=$1', [id]);
  }));

test('automatic delivery identity and payload cannot be rewritten, re-keyed, or deleted', () =>
  withFixture(async ({ user, other }) => {
    const id = await notification(user, `lifecycle:${randomUUID()}`);
    for (const [sql, values] of [
      ['UPDATE "Notification" SET text=$2 WHERE id=$1', [id, 'Rewritten']],
      ['UPDATE "Notification" SET "userId"=$2 WHERE id=$1', [id, other]],
      ['UPDATE "Notification" SET "dedupeKey"=NULL WHERE id=$1', [id]],
      ['DELETE FROM "Notification" WHERE id=$1', [id]],
    ]) {
      await rejectsSQL(sql, values, 'P0001');
    }
    const ordinary = await notification(user);
    await rejectsSQL(
      'UPDATE "Notification" SET "dedupeKey"=$2 WHERE id=$1',
      [ordinary, `lifecycle:${randomUUID()}`],
      'P0001',
    );
  }));

test('system project events have no impersonated author and retain immutable history', () =>
  withFixture(async ({ project }) => {
    const id = randomUUID();
    await connection.query(
      'INSERT INTO "ProjectEvent" (id, "projectId", "actorId", action, "metadataJson") VALUES ($1,$2,NULL,$3,$4)',
      [id, project, 'project_expired', '{"automatic":true}'],
    );
    const rows = await connection.query('SELECT "actorId" FROM "ProjectEvent" WHERE id=$1', [id]);
    assert.deepEqual(rows.rows, [{ actorId: null }]);
    await rejectsSQL('UPDATE "ProjectEvent" SET action=$2 WHERE id=$1', [id, 'rewritten'], 'P0001');
    await rejectsSQL('DELETE FROM "ProjectEvent" WHERE id=$1', [id], 'P0001');
  }));

async function runRow(changes = {}) {
  const values = {
    id: randomUUID(),
    job: 'project-lifecycle',
    status: 'completed',
    startedAt: new Date('2026-01-01T00:00:00Z'),
    finishedAt: new Date('2026-01-01T00:00:01Z'),
    expiredProjects: 0,
    remindersCreated: 0,
    scannedProjects: 0,
    errorCode: null,
    nextCursor: null,
    ...changes,
  };
  return {
    sql: 'INSERT INTO "BackgroundJobRun" (id, job, status, "startedAt", "finishedAt", "expiredProjects", "remindersCreated", "scannedProjects", "errorCode", "nextCursor") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    values: Object.values(values),
    id: values.id,
  };
}

test('finished worker logs and their round-robin cursor are append-only', () =>
  withFixture(async () => {
    const row = await runRow({
      nextCursor: 'last-seen-project',
      expiredProjects: 1,
      remindersCreated: 2,
    });
    await connection.query(row.sql, row.values);
    const rows = await connection.query(
      'SELECT "nextCursor", "expiredProjects" FROM "BackgroundJobRun" WHERE id=$1',
      [row.id],
    );
    assert.deepEqual(rows.rows, [{ nextCursor: 'last-seen-project', expiredProjects: 1 }]);
    await rejectsSQL(
      'UPDATE "BackgroundJobRun" SET "nextCursor"=$2 WHERE id=$1',
      [row.id, 'changed'],
      'P0001',
    );
    await rejectsSQL('DELETE FROM "BackgroundJobRun" WHERE id=$1', [row.id], 'P0001');
  }));

test('worker logs reject unknown states, negative counts, reverse clocks and blank codes', () =>
  withFixture(async () => {
    for (const [changes, constraint] of [
      [{ job: 'unknown' }, 'BackgroundJobRun_valid_job'],
      [{ status: 'running' }, 'BackgroundJobRun_valid_status'],
      [{ remindersCreated: -1 }, 'BackgroundJobRun_nonnegative_counts'],
      [{ finishedAt: new Date('2025-12-31T23:59:59Z') }, 'BackgroundJobRun_valid_times'],
      [{ errorCode: ' ' }, 'BackgroundJobRun_valid_error_code'],
    ]) {
      const row = await runRow(changes);
      await rejectsSQL(row.sql, row.values, '23514', constraint);
    }
  }));

test('worker-log default start uses UTC under a non-UTC session', () =>
  withFixture(async () => {
    await connection.query("SET LOCAL TIME ZONE 'Pacific/Auckland'");
    const id = randomUUID();
    await connection.query(
      'INSERT INTO "BackgroundJobRun" (id,status,"finishedAt") VALUES ($1,$2,timezone(\'UTC\',CURRENT_TIMESTAMP)+interval \'1 second\')',
      [id, 'busy'],
    );
    const rows = await connection.query(
      'SELECT abs(extract(epoch FROM (timezone(\'UTC\',CURRENT_TIMESTAMP)-"startedAt")))<1 AS utc FROM "BackgroundJobRun" WHERE id=$1',
      [id],
    );
    assert.equal(rows.rows[0].utc, true);
  }));
