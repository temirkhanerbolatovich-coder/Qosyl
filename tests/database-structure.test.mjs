import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import pg from 'pg';

// Never derive a writable target from the application's default database.
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

async function withProject(run) {
  await connection.query('BEGIN');
  try {
    const ids = {
      project: randomUUID(),
      client: randomUUID(),
      first: randomUUID(),
      second: randomUUID(),
    };
    for (const id of [ids.client, ids.first, ids.second]) {
      await connection.query(
        'INSERT INTO "User" (id, name, email, "updatedAt") VALUES ($1, $2, $3, now())',
        [id, 'Database structure test', `${id}@example.test`],
      );
    }
    await connection.query(
      `INSERT INTO "Project" (id, "clientId", title, category, problem, description,
        deliverables, "acceptanceCriteria", "budgetKzt", "estimatedHours", "dueAt", "updatedAt")
       VALUES ($1, $2, 'Database structure test', 'design', 'Test problem', 'Test description',
        'Test result', ARRAY['Test criterion'], 1000, 1, now() + interval '1 day', now())`,
      [ids.project, ids.client],
    );
    await run(ids);
  } finally {
    // Rollback preserves immutable history and leaves no fixture accounts or projects.
    await connection.query('ROLLBACK');
  }
}

async function rejectsConstraint(sql, values, code, constraint) {
  await connection.query('SAVEPOINT rejected_write');
  try {
    await assert.rejects(connection.query(sql, values), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.constraint, constraint);
      return true;
    });
  } finally {
    await connection.query('ROLLBACK TO SAVEPOINT rejected_write');
  }
}

test('a project cannot select two applications even through direct SQL', () =>
  withProject(async ({ project, first, second }) => {
    await connection.query(
      `INSERT INTO "Application" (id, "projectId", "studentId", message, status, "updatedAt")
       VALUES ($1, $2, $3, 'First application', 'selected', now())`,
      [randomUUID(), project, first],
    );
    await rejectsConstraint(
      `INSERT INTO "Application" (id, "projectId", "studentId", message, status, "updatedAt")
       VALUES ($1, $2, $3, 'Second application', 'selected', now())`,
      [randomUUID(), project, second],
      '23505',
      'Application_one_selected_per_project',
    );
    const selected = await connection.query(
      'SELECT "studentId" FROM "Application" WHERE "projectId" = $1 AND status = $2',
      [project, 'selected'],
    );
    assert.deepEqual(selected.rows, [{ studentId: first }]);
  }));

test('milestones reference an existing version of their own project', () =>
  withProject(async ({ project }) => {
    await connection.query(
      'INSERT INTO "AgreementVersion" (id, "projectId", number, "snapshotJson") VALUES ($1, $2, 1, $3)',
      [randomUUID(), project, '{}'],
    );
    await connection.query(
      'INSERT INTO "ProjectMilestone" (id, "projectId", title, "agreementNumber") VALUES ($1, $2, $3, 1)',
      [randomUUID(), project, 'Valid milestone'],
    );
    await rejectsConstraint(
      'INSERT INTO "ProjectMilestone" (id, "projectId", title, "agreementNumber") VALUES ($1, $2, $3, 2)',
      [randomUUID(), project, 'Unknown version'],
      '23503',
      'ProjectMilestone_projectId_agreementNumber_fkey',
    );
  }));

test('agreement and milestone version numbers are positive', () =>
  withProject(async ({ project }) => {
    await rejectsConstraint(
      'INSERT INTO "AgreementVersion" (id, "projectId", number, "snapshotJson") VALUES ($1, $2, 0, $3)',
      [randomUUID(), project, '{}'],
      '23514',
      'AgreementVersion_positive_number',
    );
    await rejectsConstraint(
      'INSERT INTO "ProjectMilestone" (id, "projectId", title, "agreementNumber") VALUES ($1, $2, $3, 0)',
      [randomUUID(), project, 'Invalid version'],
      '23514',
      'ProjectMilestone_positive_agreement_number',
    );
  }));

test('payment confirmation follows both claims and a dispute retains their evidence', () =>
  withProject(async ({ project }) => {
    await connection.query(
      'INSERT INTO "PaymentAcknowledgement" ("projectId", "updatedAt") VALUES ($1, now())',
      [project],
    );
    await rejectsConstraint(
      'UPDATE "PaymentAcknowledgement" SET status = $2, "studentReceivedAt" = now() WHERE "projectId" = $1',
      [project, 'confirmed_received_by_student'],
      '23514',
      'PaymentAcknowledgement_claims_match_status',
    );
    await connection.query(
      'UPDATE "PaymentAcknowledgement" SET status = $2, "clientPaidAt" = now() WHERE "projectId" = $1',
      [project, 'reported_paid_by_client'],
    );
    await connection.query(
      'UPDATE "PaymentAcknowledgement" SET status = $2, "studentReceivedAt" = now() WHERE "projectId" = $1',
      [project, 'confirmed_received_by_student'],
    );
    await connection.query(
      'UPDATE "PaymentAcknowledgement" SET status = $2 WHERE "projectId" = $1',
      [project, 'disputed'],
    );
    const {
      rows: [payment],
    } = await connection.query(
      'SELECT status, "clientPaidAt", "studentReceivedAt" FROM "PaymentAcknowledgement" WHERE "projectId" = $1',
      [project],
    );
    assert.equal(payment.status, 'disputed');
    assert.ok(payment.clientPaidAt instanceof Date);
    assert.ok(payment.studentReceivedAt instanceof Date);
  }));

test('a report cannot become resolved without a recorded resolution and time', () =>
  withProject(async ({ project, client }) => {
    const report = randomUUID();
    await connection.query(
      'INSERT INTO "Report" (id, "authorId", "projectId", reason) VALUES ($1, $2, $3, $4)',
      [report, client, project, 'A test report'],
    );
    await rejectsConstraint(
      'UPDATE "Report" SET status = $2 WHERE id = $1',
      [report, 'resolved'],
      '23514',
      'Report_resolution_matches_status',
    );
    await rejectsConstraint(
      'UPDATE "Report" SET status = $2 WHERE id = $1',
      [report, 'unknown'],
      '23514',
      'Report_valid_status',
    );
    await connection.query(
      'UPDATE "Report" SET status = $2, resolution = $3, "resolvedAt" = now() WHERE id = $1',
      [report, 'resolved', 'Resolved by the moderator'],
    );
    const {
      rows: [resolved],
    } = await connection.query('SELECT status FROM "Report" WHERE id = $1', [report]);
    assert.equal(resolved.status, 'resolved');
  }));

test('client verification status cannot be an arbitrary value', () =>
  withProject(async ({ client }) => {
    await rejectsConstraint(
      'INSERT INTO "ClientProfile" ("userId", name, "verificationStatus", "updatedAt") VALUES ($1, $2, $3, now())',
      [client, 'Test client', 'self_verified'],
      '23514',
      'ClientProfile_valid_verification_status',
    );
    await connection.query(
      'INSERT INTO "ClientProfile" ("userId", name, "verificationStatus", "updatedAt") VALUES ($1, $2, $3, now())',
      [client, 'Test client', 'pending'],
    );
  }));
