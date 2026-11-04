import { ContentFetchError } from '../src/server/content/fetch-feed';
import { inspectContentPage } from '../src/server/content/inspection';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import {
  mutateContentIntake,
  queryContentIntake,
  queryContentDetail,
} from '../src/server/content/service';
import { queryPublicContent } from '../src/server/content/public';
import { runContentIntake } from '../src/server/content/worker';
import { publicContentQueryInput } from '../src/lib/content-validation';
const target = new URL(process.env.DATABASE_URL || 'invalid:');
if (
  !/^\/student_marketplace_e2e(?:_content_[a-f0-9]{12})?$/.test(target.pathname) ||
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  process.env.DATABASE_TEST_URL !== process.env.DATABASE_URL
)
  throw Error('Isolated test database required');
after(() => db.$disconnect());
test('HTML collection, latest revision search and approved-only catalogue', async () => {
  const original = await db.contentModuleSettings.findUniqueOrThrow({ where: { id: 'content' } });
  const actor = await db.user.create({
    data: {
      id: randomUUID(),
      email: randomUUID() + '@example.test',
      name: 'Discovery fixture',
      roles: ['admin'],
      emailVerified: true,
    },
  });
  let sourceId = '';
  try {
    await mutateContentIntake({ action: 'setModuleEnabled', enabled: true }, actor);
    const created = await mutateContentIntake(
      {
        action: 'createSource',
        name: 'Synthetic HTML opportunity source',
        type: 'html',
        feedUrl: 'https://example.org/list',
        allowedHost: 'example.org',
        enabled: true,
        rightsNote: 'Synthetic closed queue test; no public publication',
      },
      actor,
    );
    assert.ok('sourceId' in created);
    sourceId = created.sourceId;
    const run = await runContentIntake(db, {
      sourceId,
      fetcher: async (_url, _host, options) => {
        assert.equal(options?.format, 'html');
        return {
          status: 200,
          retryAfterSeconds: null,
          body: '<main><h2><a href="/grant-medical-unique">Медицинский грант discoveryUniqueFixture</a></h2><h2><a href="/law-fixture">ҚҰҚЫҚ ЖӘНЕ ЗАҢГЕР: legalDiscoveryFixture</a></h2><h2><a href="/tour-fixture">Туристическая практика travelDiscoveryFixture</a></h2><h2><a href="/web-fixture">Веб-сервис travelDiscoveryFixture</a></h2></main>',
        };
      },
    });
    assert.equal(run.status, 'succeeded');
    for (const [q, specialty] of [
      ['legalDiscoveryFixture', 'business'],
      ['travelDiscoveryFixture', 'services'],
    ] as const) {
      const filter = publicContentQueryInput.parse({ q, specialty });
      assert.equal((await queryContentIntake(actor, 1, undefined, filter)).total, 1);
      assert.deepEqual((await queryPublicContent(6, filter)).posts, []);
    }
    const query = publicContentQueryInput.parse({
      q: 'discoveryUniqueFixture',
      category: 'grant',
      specialty: 'health',
    });
    const queue = await queryContentIntake(actor, 1, undefined, query);
    assert.equal(queue.total, 1);
    const item = queue.items[0];
    assert.equal(item.status, 'pending_review');
    assert.deepEqual((await queryPublicContent(6, query)).posts, []);
    const snapshot = await db.contentItem.findUniqueOrThrow({ where: { id: item.id } });
    const fields = {
      itemId: item.id,
      expectedRevisionId: item.revisions[0].id,
      expectedUpdatedAt: item.updatedAt.toISOString(),
    };
    let fetches = 0;
    const fetcher = async () => {
      fetches++;
      return {
        status: 200,
        retryAfterSeconds: null,
        body:
          '<article><h1>Грант медицинского университета</h1>' +
          [30, 29, 28, 27]
            .map(
              (day) =>
                `<p>Документы принимаются до ${day} октября 2026 года; ${'Дополнительные сведения о подаче документов '.repeat(12)}</p>`,
            )
            .join('') +
          `<h2>Требования для участия:</h2><ul><li>Только резиденты 2 курса</li><li>${'Необходимы подтверждающие документы '.repeat(20)}</li><li>${'Дополнительное условие '.repeat(20)}</li></ul><p><a href="https://example.org/apply">Подать заявку</a></p></article>`,
      };
    };
    await assert.rejects(inspectContentPage(db, { ...actor, roles: ['student'] }, fields, fetcher));
    await assert.rejects(
      inspectContentPage(db, actor, { ...fields, expectedRevisionId: 'wrong' }, fetcher),
    );
    assert.equal(fetches, 0);
    await inspectContentPage(db, actor, fields, fetcher);
    assert.deepEqual(await db.contentItem.findUniqueOrThrow({ where: { id: item.id } }), snapshot);
    assert.equal(await db.contentRevision.count({ where: { itemId: item.id } }), 1);
    const evidence = await db.contentAudit.findFirstOrThrow({
      where: { itemId: item.id, action: 'page_inspection_completed' },
    });
    assert.equal(evidence.revisionId, fields.expectedRevisionId);
    assert.match(evidence.reason, /2026-10-30/);
    assert.match(evidence.reason, /Только резиденты/);
    assert.ok(
      evidence.reason.length <= 2000,
      'Completed evidence must satisfy the real SQL audit limit.',
    );
    assert.match(evidence.reason, /сокращена/);
    await assert.rejects(inspectContentPage(db, actor, fields, fetcher));
    assert.equal(fetches, 1);
    const failureActor = await db.user.create({
      data: {
        id: randomUUID(),
        email: randomUUID() + '@example.test',
        name: 'Failure inspector',
        roles: ['admin'],
        emailVerified: true,
      },
    });
    const failureItem = await db.contentItem.findFirstOrThrow({
      where: { sourceId, id: { not: item.id } },
      include: { revisions: { orderBy: { number: 'desc' }, take: 1 } },
    });
    await inspectContentPage(
      db,
      failureActor,
      {
        itemId: failureItem.id,
        expectedRevisionId: failureItem.revisions[0].id,
        expectedUpdatedAt: failureItem.updatedAt.toISOString(),
      },
      async () => {
        throw new ContentFetchError('FEED_TIMEOUT');
      },
    );
    assert.match(
      (
        await db.contentAudit.findFirstOrThrow({
          where: { itemId: failureItem.id, action: 'page_inspection_failed' },
        })
      ).reason,
      /FEED_TIMEOUT/,
    );
    assert.deepEqual(await db.contentItem.findUniqueOrThrow({ where: { id: item.id } }), snapshot);
    const review = await queryContentDetail(actor, item.id);
    await mutateContentIntake(
      {
        action: 'reviewContent',
        itemId: item.id,
        expectedRevisionId: review.item.revisions[0].id,
        expectedUpdatedAt: review.item.updatedAt.toISOString(),
        decision: 'publish',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        reason: 'Synthetic explicit approval to test public filters.',
      },
      actor,
    );
    assert.equal((await queryPublicContent(6, query)).posts.length, 1);
    assert.equal(
      (
        await queryPublicContent(
          6,
          publicContentQueryInput.parse({ q: 'discoveryUniqueFixture', specialty: 'agriculture' }),
        )
      ).posts.length,
      0,
    );
    assert.equal(
      (
        await queryContentIntake(
          actor,
          1,
          undefined,
          publicContentQueryInput.parse({ q: "' OR true -- discoveryUniqueFixture" }),
        )
      ).total,
      0,
    );
    const current = await queryContentDetail(actor, item.id);
    await mutateContentIntake(
      {
        action: 'editContent',
        itemId: item.id,
        expectedRevisionId: current.item.revisions[0].id,
        expectedUpdatedAt: current.item.updatedAt.toISOString(),
        url: item.canonicalUrl,
        title: 'Экономический грант discoveryRevisedFixture',
        summary: 'Для студентов бизнеса',
        category: 'grant',
        language: 'ru',
        reason: 'Synthetic updated topic must hide old approved version.',
      },
      actor,
    );
    assert.equal((await queryContentIntake(actor, 1, undefined, query)).total, 0);
    assert.equal(
      (
        await queryContentIntake(
          actor,
          1,
          undefined,
          publicContentQueryInput.parse({ q: 'discoveryRevisedFixture', specialty: 'business' }),
        )
      ).total,
      1,
    );
    assert.deepEqual((await queryPublicContent(6, query)).posts, []);
  } finally {
    if (sourceId)
      await db.contentSource.update({ where: { id: sourceId }, data: { enabled: false } });
    await db.contentModuleSettings.update({
      where: { id: 'content' },
      data: { enabled: original.enabled },
    });
  }
});
