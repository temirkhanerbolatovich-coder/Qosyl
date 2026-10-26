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
const connection = new pg.Client({ connectionString: databaseUrl.toString() });
before(() => connection.connect());
after(() => connection.end());

async function withFixture(run) {
  await connection.query('BEGIN');
  try {
    const ids = {
      client: randomUUID(),
      student: randomUUID(),
      admin: randomUUID(),
      project: randomUUID(),
    };
    for (const id of [ids.client, ids.student, ids.admin]) {
      await connection.query(
        'INSERT INTO "User" (id, name, email, "updatedAt") VALUES ($1, $2, $3, now())',
        [id, 'Pilot database test', `${id}@example.test`],
      );
    }
    await connection.query(
      `INSERT INTO "Project" (id, "clientId", title, category, problem, description,
        deliverables, "acceptanceCriteria", "budgetKzt", "estimatedHours", "dueAt", "updatedAt")
       VALUES ($1, $2, 'Pilot database test', 'design', 'Test problem', 'Test description',
        'Test result', ARRAY['Test criterion'], 1000, 1, now() + interval '1 day', now())`,
      [ids.project, ids.client],
    );
    await run(ids);
  } finally {
    // Fixtures never survive; append-only tables are rolled back rather than deleted.
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

function costValues(ids, changes = {}) {
  return {
    id: randomUUID(),
    recordedById: ids.admin,
    projectId: ids.project,
    kind: 'moderation',
    occurredAt: new Date(),
    minutes: 10,
    amountKzt: 0,
    description: 'Pilot database test',
    idempotencyKey: randomUUID(),
    ...changes,
  };
}
const insertCostSQL = `INSERT INTO "PilotCostEntry" (id, "recordedById", "projectId", kind,
  "occurredAt", minutes, "amountKzt", description, "idempotencyKey")
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
function values(cost) {
  return [
    cost.id,
    cost.recordedById,
    cost.projectId,
    cost.kind,
    cost.occurredAt,
    cost.minutes,
    cost.amountKzt,
    cost.description,
    cost.idempotencyKey,
  ];
}

test('view defaults use UTC even under a non-UTC PostgreSQL session', () =>
  withFixture(async ({ project, student }) => {
    await connection.query("SET LOCAL TIME ZONE 'Pacific/Auckland'");
    await connection.query('INSERT INTO "ProjectView" ("projectId", "studentId") VALUES ($1, $2)', [
      project,
      student,
    ]);
    const result = await connection.query(
      `SELECT
      abs(extract(epoch FROM (timezone('UTC', CURRENT_TIMESTAMP) - "firstViewedAt"))) < 1 AS utc_default,
      (SELECT "viewsStartedAt" <= timezone('UTC', clock_timestamp()) FROM "PilotAnalyticsSettings" WHERE id='pilot') AS started
      FROM "ProjectView" WHERE "projectId"=$1 AND "studentId"=$2`,
      [project, student],
    );
    assert.equal(result.rows[0].utc_default, true);
    assert.equal(result.rows[0].started, true);
  }));

test('view collection has one immutable persisted start', () =>
  withFixture(async () => {
    const result = await connection.query(
      'SELECT id, "viewsStartedAt" FROM "PilotAnalyticsSettings"',
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].id, 'pilot');
    assert.ok(result.rows[0].viewsStartedAt instanceof Date);
    await rejectsSQL(
      'INSERT INTO "PilotAnalyticsSettings" (id) VALUES ($1)',
      ['another'],
      '23514',
      'PilotAnalyticsSettings_singleton',
    );
    await rejectsSQL(
      'UPDATE "PilotAnalyticsSettings" SET "viewsStartedAt" = now() WHERE id = $1',
      ['pilot'],
      'P0001',
    );
    await rejectsSQL('DELETE FROM "PilotAnalyticsSettings" WHERE id = $1', ['pilot'], 'P0001');
  }));

test('a student-project view deduplicates without changing the first timestamp', () =>
  withFixture(async (ids) => {
    const first = new Date('2026-10-26T01:00:00.000Z');
    await connection.query(
      'INSERT INTO "ProjectView" ("projectId", "studentId", "firstViewedAt") VALUES ($1, $2, $3)',
      [ids.project, ids.student, first],
    );
    const duplicate = await connection.query(
      'INSERT INTO "ProjectView" ("projectId", "studentId") VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [ids.project, ids.student],
    );
    assert.equal(duplicate.rowCount, 0);
    const result = await connection.query(
      'SELECT "firstViewedAt" FROM "ProjectView" WHERE "projectId" = $1 AND "studentId" = $2',
      [ids.project, ids.student],
    );
    assert.equal(result.rows[0].firstViewedAt.toISOString(), first.toISOString());
    await rejectsSQL(
      'UPDATE "ProjectView" SET "firstViewedAt" = now() WHERE "projectId" = $1',
      [ids.project],
      'P0001',
    );
    await rejectsSQL('DELETE FROM "ProjectView" WHERE "projectId" = $1', [ids.project], 'P0001');
  }));

test('view pairs reference existing accounts and projects', () =>
  withFixture(async (ids) => {
    await rejectsSQL(
      'INSERT INTO "ProjectView" ("projectId", "studentId") VALUES ($1, $2)',
      [randomUUID(), ids.student],
      '23503',
      'ProjectView_projectId_fkey',
    );
    await rejectsSQL(
      'INSERT INTO "ProjectView" ("projectId", "studentId") VALUES ($1, $2)',
      [ids.project, randomUUID()],
      '23503',
      'ProjectView_studentId_fkey',
    );
  }));

test('cost idempotency keys belong to the recording actor', () =>
  withFixture(async (ids) => {
    const entry = costValues(ids);
    await connection.query(insertCostSQL, values(entry));
    await rejectsSQL(
      insertCostSQL,
      values({ ...entry, id: randomUUID() }),
      '23505',
      'PilotCostEntry_recordedById_idempotencyKey_key',
    );
    await connection.query(
      insertCostSQL,
      values({ ...entry, id: randomUUID(), recordedById: ids.client }),
    );
    const result = await connection.query(
      'SELECT count(*)::int AS count FROM "PilotCostEntry" WHERE "idempotencyKey" = $1',
      [entry.idempotencyKey],
    );
    assert.equal(result.rows[0].count, 2);
  }));

test('costs require bounded positive time or money and a meaningful description', () =>
  withFixture(async (ids) => {
    for (const change of [
      { minutes: -1 },
      { minutes: 100001 },
      { amountKzt: -1 },
      { amountKzt: 10000001 },
      { minutes: 0, amountKzt: 0 },
    ]) {
      await rejectsSQL(
        insertCostSQL,
        values(costValues(ids, change)),
        '23514',
        'PilotCostEntry_valid_totals',
      );
    }
    await rejectsSQL(
      insertCostSQL,
      values(costValues(ids, { description: '  ' })),
      '23514',
      'PilotCostEntry_valid_description',
    );
    await connection.query(
      insertCostSQL,
      values(costValues(ids, { projectId: null, minutes: 0, amountKzt: 1000 })),
    );
  }));

test('cost payload cannot be edited or removed after insertion', () =>
  withFixture(async (ids) => {
    const entry = costValues(ids);
    await connection.query(insertCostSQL, values(entry));
    await rejectsSQL(
      'UPDATE "PilotCostEntry" SET "amountKzt" = 1000 WHERE id = $1',
      [entry.id],
      'P0001',
    );
    await rejectsSQL(
      'UPDATE "PilotCostEntry" SET description = $2 WHERE id = $1',
      [entry.id, 'Rewritten history'],
      'P0001',
    );
    await rejectsSQL('DELETE FROM "PilotCostEntry" WHERE id = $1', [entry.id], 'P0001');
    const result = await connection.query(
      'SELECT "amountKzt", description FROM "PilotCostEntry" WHERE id = $1',
      [entry.id],
    );
    assert.deepEqual(result.rows, [{ amountKzt: entry.amountKzt, description: entry.description }]);
  }));

test('a cost permits one complete void, retaining original values', () =>
  withFixture(async (ids) => {
    const entry = costValues(ids);
    await connection.query(insertCostSQL, values(entry));
    await rejectsSQL(
      'UPDATE "PilotCostEntry" SET "voidedAt" = now() WHERE id = $1',
      [entry.id],
      '23514',
      'PilotCostEntry_complete_void',
    );
    await connection.query(
      'UPDATE "PilotCostEntry" SET "voidedAt" = now(), "voidedById" = $2, "voidReason" = $3 WHERE id = $1',
      [entry.id, ids.admin, 'Mistaken test entry voided'],
    );
    await rejectsSQL(
      'UPDATE "PilotCostEntry" SET "voidedAt" = NULL, "voidedById" = NULL, "voidReason" = NULL WHERE id = $1',
      [entry.id],
      'P0001',
    );
    await rejectsSQL(
      'UPDATE "PilotCostEntry" SET "voidReason" = $2 WHERE id = $1',
      [entry.id, 'Rewritten cancellation reason'],
      'P0001',
    );
    const result = await connection.query(
      'SELECT minutes, "amountKzt", "voidedAt", "voidedById" FROM "PilotCostEntry" WHERE id = $1',
      [entry.id],
    );
    assert.equal(result.rows[0].minutes, entry.minutes);
    assert.equal(result.rows[0].amountKzt, entry.amountKzt);
    assert.ok(result.rows[0].voidedAt instanceof Date);
    assert.equal(result.rows[0].voidedById, ids.admin);
  }));
