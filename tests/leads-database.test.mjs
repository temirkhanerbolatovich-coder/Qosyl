import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { before, after, test } from 'node:test';
import pg from 'pg';
const target = new URL(process.env.DATABASE_TEST_URL ?? 'invalid:');
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/student_marketplace_e2e'
)
  throw new Error('Explicit local test database required.');
const db = new pg.Client({ connectionString: target.toString(), options: '-c timezone=UTC' });
before(() => db.connect());
after(() => db.end());
async function fixture(run) {
  await db.query('BEGIN');
  try {
    const owner = randomUUID(),
      other = randomUUID(),
      lead = randomUUID(),
      project = randomUUID();
    for (const id of [owner, other])
      await db.query(
        'INSERT INTO "User" (id,name,email,"updatedAt") VALUES ($1,\'Lead SQL fixture\',$2,now())',
        [id, `${id}@example.test`],
      );
    await db.query(
      'INSERT INTO "Project" (id,"clientId",title,category,problem,description,deliverables,"acceptanceCriteria","budgetKzt","estimatedHours","dueAt","updatedAt") VALUES ($1,$2,\'Lead project fixture\',\'design\',\'Test problem\',\'Test description\',\'Test result\',ARRAY[\'Test criterion\'],1000,1,now()+interval \'1 day\',now())',
      [project, owner],
    );
    await db.query(
      'INSERT INTO "Lead" (id,kind,"sourceUrl","urlHash","sourceName",title,summary,"createdById","assignedToId","expiresAt") VALUES ($1,\'business_request\',\'https://example.org/request\',$2,\'Synthetic source\',\'Private request fixture\',\'A synthetic private request without contact.\',$3,$3,timezone(\'UTC\',now())+interval \'1 day\')',
      [lead, createHash('sha256').update('https://example.org/request').digest('hex'), owner],
    );
    await run({ lead, owner, other, project });
  } finally {
    await db.query('ROLLBACK');
  }
}
async function rejects(sql, values, code) {
  await db.query('SAVEPOINT rejected_write');
  try {
    await assert.rejects(db.query(sql, values), (error) => {
      assert.equal(error.code, code);
      return true;
    });
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT rejected_write');
  }
}
test('lead identity and version cannot be rewritten or deleted', () =>
  fixture(async ({ lead }) => {
    await rejects(
      'UPDATE "Lead" SET title=\'A silently changed title\' WHERE id=$1',
      [lead],
      'P0001',
    );
    await rejects(
      'UPDATE "Lead" SET "version"=2,"sourceUrl"=\'https://example.org/other\' WHERE id=$1',
      [lead],
      'P0001',
    );
    await rejects('DELETE FROM "Lead" WHERE id=$1', [lead], 'P0001');
  }));
test('pipeline and consent require prior checks, contact and complete evidence', () =>
  fixture(async ({ lead, owner }) => {
    await rejects(
      'UPDATE "Lead" SET "version"=2,status=\'contacted\' WHERE id=$1',
      [lead],
      '23514',
    );
    await rejects(
      'UPDATE "Lead" SET "version"=2,"clientId"=$2,"consentAt"=timezone(\'UTC\',now()) WHERE id=$1',
      [lead, owner],
      '23514',
    );
    await rejects(
      'UPDATE "Lead" SET "version"=2,status=\'converted\' WHERE id=$1',
      [lead],
      '23514',
    );
  }));
test('conversion links only a project owned by the consenting client and freezes ownership', () =>
  fixture(async ({ lead, owner, other, project }) => {
    const sql =
      'UPDATE "Lead" SET "version"=2,status=\'converted\',"verifiedAt"=timezone(\'UTC\',now()),"contactedAt"=timezone(\'UTC\',now()),"consentAt"=timezone(\'UTC\',now()),"consentEvidence"=\'Synthetic consent evidence\',"clientId"=$2,"projectId"=$3,"conversionHash"=$4 WHERE id=$1';
    await rejects(sql, [lead, other, project, 'a'.repeat(64)], '23503');
    await db.query(sql, [lead, owner, project, 'a'.repeat(64)]);
    await rejects(
      'UPDATE "Lead" SET "version"=3,"clientId"=$2 WHERE id=$1',
      [lead, other],
      'P0001',
    );
    await rejects(
      'UPDATE "Lead" SET "version"=3,status=\'archived\',"projectId"=NULL,"conversionHash"=NULL WHERE id=$1',
      [lead],
      'P0001',
    );
  }));
test('lead events are append-only and have one event for each version', () =>
  fixture(async ({ lead, owner }) => {
    const id = randomUUID();
    await db.query(
      'INSERT INTO "LeadEvent" (id,"leadId","actorId",version,action,note) VALUES ($1,$2,$3,1,\'createLead\',\'Synthetic creation note\')',
      [id, lead, owner],
    );
    await rejects(
      'UPDATE "LeadEvent" SET note=\'Changed history note\' WHERE id=$1',
      [id],
      'P0001',
    );
    await rejects('DELETE FROM "LeadEvent" WHERE id=$1', [id], 'P0001');
    await rejects(
      'INSERT INTO "LeadEvent" (id,"leadId","actorId",version,action,note) VALUES ($1,$2,$3,1,\'createLead\',\'Duplicate version note\')',
      [randomUUID(), lead, owner],
      '23505',
    );
  }));
test('lead defaults keep UTC in a non-UTC database session', () =>
  fixture(async ({ lead }) => {
    await db.query("SET LOCAL TIME ZONE 'Pacific/Auckland'");
    const fresh = randomUUID();
    await db.query(
      'INSERT INTO "Lead" (id,kind,"sourceUrl","urlHash","sourceName",title,summary,"createdById","assignedToId","expiresAt") SELECT $1,kind,\'https://example.org/utc\',$2,"sourceName",title,summary,"createdById","assignedToId","expiresAt" FROM "Lead" WHERE id=$3',
      [fresh, createHash('sha256').update('https://example.org/utc').digest('hex'), lead],
    );
    const result = await db.query(
      'SELECT abs(extract(epoch FROM (timezone(\'UTC\',CURRENT_TIMESTAMP)-"createdAt")))<1 AS utc FROM "Lead" WHERE id=$1',
      [fresh],
    );
    assert.equal(result.rows[0].utc, true);
  }));
