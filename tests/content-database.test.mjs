import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
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
const hash = (value) => createHash('sha256').update(value).digest('hex');

async function withFixture(run) {
  await connection.query('BEGIN');
  try {
    const source = randomUUID();
    await connection.query(
      `INSERT INTO "ContentSource" (id, name, type, "allowedHost", "rightsNote")
       VALUES ($1, 'Synthetic source', 'manual', 'example.test', 'Synthetic test only')`,
      [source],
    );
    await run({ source });
  } finally {
    // Keep fixture history intact while rolling the whole test transaction back.
    await connection.query('ROLLBACK');
  }
}

async function rejectsSQL(sql, values, code, constraint) {
  await connection.query('SAVEPOINT rejected_write');
  try {
    await assert.rejects(connection.query(sql, values), (error) => {
      assert.equal(error.code, code);
      if (constraint) {
        const allowed = Array.isArray(constraint) ? constraint : [constraint];
        assert.ok(allowed.includes(error.constraint), `Unexpected constraint: ${error.constraint}`);
      }
      return true;
    });
  } finally {
    await connection.query('ROLLBACK TO SAVEPOINT rejected_write');
  }
}

async function item(source, externalId = null, suffix = randomUUID()) {
  const id = randomUUID();
  const canonicalUrl = `https://example.test/${suffix}`;
  await connection.query(
    `INSERT INTO "ContentItem" (id, "sourceId", "externalId", "canonicalUrl", "urlHash")
     VALUES ($1, $2, $3, $4, $5)`,
    [id, source, externalId, canonicalUrl, hash(canonicalUrl)],
  );
  return id;
}

async function revision(itemId, number = 1, contentHash = hash(randomUUID())) {
  const id = randomUUID();
  await connection.query(
    `INSERT INTO "ContentRevision" (id, "itemId", number, title, summary, category, score, "contentHash")
     VALUES ($1, $2, $3, 'Synthetic event', 'Test summary', 'event', 60, $4)`,
    [id, itemId, number, contentHash],
  );
  return id;
}

test('the module has one explicit settings identity and new sources are disabled by default', () =>
  withFixture(async ({ source }) => {
    const settings = await connection.query('SELECT id FROM "ContentModuleSettings"');
    assert.deepEqual(settings.rows, [{ id: 'content' }]);
    await rejectsSQL(
      'INSERT INTO "ContentModuleSettings" (id) VALUES ($1)',
      ['other'],
      '23514',
      'ContentModuleSettings_singleton',
    );
    const created = await connection.query('SELECT enabled FROM "ContentSource" WHERE id=$1', [
      source,
    ]);
    assert.equal(created.rows[0].enabled, false);
  }));

test('source kinds, bounded schedules and mandatory rights notes reject invalid input', () =>
  withFixture(async ({ source }) => {
    await rejectsSQL(
      'UPDATE "ContentSource" SET type=$2 WHERE id=$1',
      [source, 'social_scraper'],
      '23514',
      ['ContentSource_valid_type', 'ContentSource_feed_matches_type'],
    );
    await rejectsSQL(
      'UPDATE "ContentSource" SET type=$2 WHERE id=$1',
      [source, 'rss'],
      '23514',
      'ContentSource_feed_matches_type',
    );
    await rejectsSQL(
      'UPDATE "ContentSource" SET "feedUrl"=$2 WHERE id=$1',
      [source, 'https://example.test/feed'],
      '23514',
      'ContentSource_feed_matches_type',
    );
    await rejectsSQL(
      'UPDATE "ContentSource" SET "maxItems"=0 WHERE id=$1',
      [source],
      '23514',
      'ContentSource_bounded_schedule',
    );
    await rejectsSQL(
      'UPDATE "ContentSource" SET "rightsNote"=$2 WHERE id=$1',
      [source, ' '],
      '23514',
      'ContentSource_rights_recorded',
    );
    await connection.query('UPDATE "ContentSource" SET type=$2, "feedUrl"=$3 WHERE id=$1', [
      source,
      'rss',
      'https://example.test/feed',
    ]);
  }));

test('external identity and canonical URL deduplicate within a source while nullable IDs remain valid', () =>
  withFixture(async ({ source }) => {
    const external = 'external-identity';
    const suffix = 'same-url';
    await item(source, external, suffix);
    await rejectsSQL(
      `INSERT INTO "ContentItem" (id, "sourceId", "externalId", "canonicalUrl", "urlHash") VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), source, external, 'https://example.test/different', hash('different')],
      '23505',
      'ContentItem_sourceId_externalId_key',
    );
    await rejectsSQL(
      `INSERT INTO "ContentItem" (id, "sourceId", "canonicalUrl", "urlHash") VALUES ($1,$2,$3,$4)`,
      [
        randomUUID(),
        source,
        `https://example.test/${suffix}`,
        hash(`https://example.test/${suffix}`),
      ],
      '23505',
      'ContentItem_sourceId_urlHash_key',
    );
    await item(source);
    await item(source);
    const count = await connection.query(
      'SELECT count(*)::int AS count FROM "ContentItem" WHERE "sourceId"=$1',
      [source],
    );
    assert.equal(count.rows[0].count, 3);
  }));

test('publication requires explicit approval; relevance remains bounded', () =>
  withFixture(async ({ source }) => {
    const id = await item(source);
    await rejectsSQL(
      'UPDATE "ContentItem" SET status=$2 WHERE id=$1',
      [id, 'published'],
      '23514',
      'ContentItem_published_has_approval',
    );
    await rejectsSQL(
      `INSERT INTO "ContentRevision" (id,"itemId",number,title,summary,category,score,"contentHash") VALUES ($1,$2,1,'Test','','event',101,$3)`,
      [randomUUID(), id, hash('invalid-score')],
      '23514',
      'ContentRevision_valid_score',
    );
    assert.equal(
      (await connection.query('SELECT status FROM "ContentItem" WHERE id=$1', [id])).rows[0].status,
      'pending_review',
    );
  }));

test('approval belongs to this item and cannot omit its expiry', () =>
  withFixture(async ({ source }) => {
    const first = await item(source),
      second = await item(source);
    const approved = await revision(first);
    await rejectsSQL(
      'UPDATE "ContentItem" SET "approvedRevisionId"=$2,"approvedAt"=timezone(\'UTC\',now()),"expiresAt"=timezone(\'UTC\',now())+interval \'1 day\' WHERE id=$1',
      [second, approved],
      '23503',
      'ContentItem_approved_same_item',
    );
    await rejectsSQL(
      'UPDATE "ContentItem" SET "approvedRevisionId"=$2,"approvedAt"=timezone(\'UTC\',now()) WHERE id=$1',
      [first, approved],
      '23514',
      'ContentItem_publication_times',
    );
    await connection.query(
      'UPDATE "ContentItem" SET status=\'published\',"approvedRevisionId"=$2,"approvedAt"=timezone(\'UTC\',now()),"expiresAt"=timezone(\'UTC\',now())+interval \'1 day\' WHERE id=$1',
      [first, approved],
    );
  }));

test('editorial decisions require attribution, reason and matching revision', () =>
  withFixture(async ({ source }) => {
    const first = await item(source),
      second = await item(source),
      rev = await revision(first);
    await rejectsSQL(
      'INSERT INTO "ContentAudit" (id,"itemId","revisionId",action,reason) VALUES ($1,$2,$3,\'content_published\',\'Valid long reason\')',
      [randomUUID(), first, rev],
      '23514',
      'ContentAudit_editorial_attribution',
    );
    await rejectsSQL(
      'INSERT INTO "ContentAudit" (id,"itemId","revisionId",action,reason) VALUES ($1,$2,$3,\'test_action\',\'Long test reason\')',
      [randomUUID(), second, rev],
      '23503',
      'ContentAudit_revision_same_item',
    );
  }));

test('new revisions retain unique sequence, repeated content occurrences and immutable originals', () =>
  withFixture(async ({ source }) => {
    const id = await item(source);
    const contentHash = hash('first revision');
    const original = await revision(id, 1, contentHash);
    await rejectsSQL(
      `INSERT INTO "ContentRevision" (id,"itemId",number,title,summary,category,score,"contentHash") VALUES ($1,$2,1,'Other','','event',50,$3)`,
      [randomUUID(), id, hash('another')],
      '23505',
      'ContentRevision_itemId_number_key',
    );
    await revision(id, 2, hash('changed revision'));
    await revision(id, 3, contentHash);
    await rejectsSQL(
      'UPDATE "ContentRevision" SET title=$2 WHERE id=$1',
      [original, 'Overwrite'],
      'P0001',
    );
    await rejectsSQL('DELETE FROM "ContentRevision" WHERE id=$1', [original], 'P0001');
  }));

test('a source has at most one queued or running crawl and a finished run releases the slot', () =>
  withFixture(async ({ source }) => {
    const id = randomUUID();
    await connection.query('INSERT INTO "CrawlRun" (id,"sourceId") VALUES ($1,$2)', [id, source]);
    await rejectsSQL(
      'INSERT INTO "CrawlRun" (id,"sourceId") VALUES ($1,$2)',
      [randomUUID(), source],
      '23505',
      'CrawlRun_one_active_per_source',
    );
    await connection.query(
      `UPDATE "CrawlRun" SET status='running', "startedAt"=timezone('UTC',now()), "leaseUntil"=timezone('UTC',now()) + interval '2 minutes' WHERE id=$1`,
      [id],
    );
    await rejectsSQL(
      'INSERT INTO "CrawlRun" (id,"sourceId") VALUES ($1,$2)',
      [randomUUID(), source],
      '23505',
      'CrawlRun_one_active_per_source',
    );
    await connection.query(
      `UPDATE "CrawlRun" SET status='succeeded', "finishedAt"=timezone('UTC',now()), "leaseUntil"=NULL WHERE id=$1`,
      [id],
    );
    await connection.query('INSERT INTO "CrawlRun" (id,"sourceId") VALUES ($1,$2)', [
      randomUUID(),
      source,
    ]);
  }));

test('crawl state and counters reject impossible transitions', () =>
  withFixture(async ({ source }) => {
    const id = randomUUID();
    await connection.query('INSERT INTO "CrawlRun" (id,"sourceId") VALUES ($1,$2)', [id, source]);
    await rejectsSQL(
      'UPDATE "CrawlRun" SET status=$2 WHERE id=$1',
      [id, 'running'],
      '23514',
      'CrawlRun_state_times',
    );
    await rejectsSQL(
      'UPDATE "CrawlRun" SET status=$2 WHERE id=$1',
      [id, 'failed'],
      '23514',
      'CrawlRun_state_times',
    );
    await rejectsSQL(
      'UPDATE "CrawlRun" SET found=-1 WHERE id=$1',
      [id],
      '23514',
      'CrawlRun_nonnegative_counts',
    );
    await connection.query(
      `UPDATE "CrawlRun" SET status='failed', "finishedAt"=timezone('UTC',now()), "errorCode"='TEST_FAILURE' WHERE id=$1`,
      [id],
    );
  }));

test('content audit permits a system actor but cannot be edited or deleted', () =>
  withFixture(async ({ source }) => {
    const id = randomUUID();
    await connection.query(
      'INSERT INTO "ContentAudit" (id,"sourceId",action,reason) VALUES ($1,$2,$3,$4)',
      [id, source, 'test_import', 'Synthetic import'],
    );
    const audit = await connection.query('SELECT "actorId" FROM "ContentAudit" WHERE id=$1', [id]);
    assert.equal(audit.rows[0].actorId, null);
    await rejectsSQL(
      'UPDATE "ContentAudit" SET reason=$2 WHERE id=$1',
      [id, 'Changed history'],
      'P0001',
    );
    await rejectsSQL('DELETE FROM "ContentAudit" WHERE id=$1', [id], 'P0001');
    await rejectsSQL(
      'DELETE FROM "ContentSource" WHERE id=$1',
      [source],
      '23001',
      'ContentAudit_sourceId_fkey',
    );
  }));

test('new content timestamps use UTC under a non-UTC PostgreSQL session', () =>
  withFixture(async ({ source }) => {
    await connection.query("SET LOCAL TIME ZONE 'Pacific/Auckland'");
    const id = await item(source);
    const result = await connection.query(
      `SELECT abs(extract(epoch FROM (timezone('UTC', CURRENT_TIMESTAMP) - "createdAt"))) < 1 AS utc_default FROM "ContentItem" WHERE id=$1`,
      [id],
    );
    assert.equal(result.rows[0].utc_default, true);
  }));
