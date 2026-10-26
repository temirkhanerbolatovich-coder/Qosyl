import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import type { Prisma } from '@prisma/client';
import { db } from '../src/lib/db';
import { AppError } from '../src/lib/permissions';
import { apiFailure } from '../src/server/api/http';
import { mutateContentIntake, queryContentIntake } from '../src/server/content/service';
import { runContentIntake } from '../src/server/content/worker';
import { ContentFetchError, type FeedFetchResult } from '../src/server/content/fetch-feed';

const target = new URL(process.env.DATABASE_TEST_URL ?? 'invalid:');
const actual = new URL(process.env.DATABASE_URL ?? 'invalid:');
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  !/^\/student_marketplace_e2e(?:_content_[a-f0-9]{12})?$/.test(target.pathname) ||
  actual.toString() !== target.toString()
) {
  throw new Error('DATABASE_URL and DATABASE_TEST_URL must select the same local E2E database.');
}
after(() => db.$disconnect());

const rejectsStatus = (status: number) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.status, status);
  return true;
};

function feed(sourceId: string, title = 'Student hackathon registration') {
  return `<?xml version="1.0"?><rss version="2.0"><channel>
    <title>Synthetic integration feed</title><item>
    <guid>synthetic-${sourceId}</guid><link>https://example.org/intake/${sourceId}?utm_source=test</link>
    <title>${title}</title><description>Student opportunity for integration verification.</description>
    <pubDate>Mon, 26 Oct 2026 00:00:00 GMT</pubDate>
    </item></channel></rss>`;
}

const successfulFeed =
  (sourceId: string, title?: string) => async (): Promise<FeedFetchResult> => ({
    status: 200,
    body: feed(sourceId, title),
    retryAfterSeconds: null,
  });

// These tests intentionally retain revision/audit history. Only fixture sources are disabled on exit.
test('closed content intake on the isolated E2E database', { concurrency: false }, async (t) => {
  const originalSettings = await db.contentModuleSettings.findUniqueOrThrow({
    where: { id: 'content' },
  });
  const sourceIds: string[] = [];
  const admin = await db.user.create({
    data: {
      id: randomUUID(),
      name: 'Synthetic content administrator',
      email: `${randomUUID()}@example.test`,
      emailVerified: true,
      roles: ['admin'],
    },
  });
  const setEnabled = (enabled: boolean) =>
    mutateContentIntake({ action: 'setModuleEnabled', enabled }, admin);
  const createSource = async (
    type: 'manual' | 'rss',
    overrides: Partial<Prisma.ContentSourceCreateInput> = {},
  ) => {
    const source = await db.contentSource.create({
      data: {
        name: `Synthetic integration ${randomUUID()}`,
        type,
        allowedHost: 'example.org',
        feedUrl: type === 'rss' ? `https://example.org/feeds/${randomUUID()}.xml` : null,
        rightsNote: 'Synthetic fixture; no external source is fetched.',
        enabled: true,
        ...overrides,
      },
    });
    sourceIds.push(source.id);
    return source;
  };
  const makeDue = (sourceId: string) =>
    db.contentSource.update({
      where: { id: sourceId },
      data: { nextRunAt: new Date(Date.now() - 1000) },
    });

  try {
    await t.test(
      'disabled module does not fetch or accept content; reads do not enqueue work',
      async () => {
        await setEnabled(false);
        const source = await createSource('rss');
        let fetches = 0;
        const result = await runContentIntake(db, {
          sourceId: source.id,
          fetcher: async () => {
            fetches += 1;
            throw new Error('A disabled module must never fetch.');
          },
        });
        assert.equal(result.status, 'idle');
        assert.equal(fetches, 0);
        assert.equal(await db.crawlRun.count({ where: { sourceId: source.id } }), 0);
        await queryContentIntake(admin);
        await queryContentIntake(admin);
        assert.equal(await db.crawlRun.count({ where: { sourceId: source.id } }), 0);
        await assert.rejects(
          mutateContentIntake({ action: 'requestSync', sourceId: source.id }, admin),
          rejectsStatus(409),
        );
      },
    );

    await t.test(
      'admin-only access and current persisted role/account state are enforced',
      async () => {
        await assert.rejects(
          queryContentIntake({ ...admin, roles: ['student'] }),
          rejectsStatus(403),
        );
        await assert.rejects(
          mutateContentIntake(
            { action: 'setModuleEnabled', enabled: true },
            { ...admin, roles: ['student'] },
          ),
          rejectsStatus(403),
        );
        await assert.rejects(queryContentIntake(admin, 0), rejectsStatus(400));
        try {
          await db.user.update({ where: { id: admin.id }, data: { roles: ['student'] } });
          await assert.rejects(setEnabled(true), rejectsStatus(403));
          await db.user.update({
            where: { id: admin.id },
            data: { roles: ['admin'], status: 'suspended' },
          });
          await assert.rejects(setEnabled(true), rejectsStatus(403));
        } finally {
          await db.user.update({
            where: { id: admin.id },
            data: { roles: ['admin'], status: 'active' },
          });
        }
        await setEnabled(true);
        const view = await queryContentIntake(admin);
        assert.equal(view.settings.enabled, true);
        assert.ok(Array.isArray(view.sources));
      },
    );

    await t.test(
      'source registry records rights and actor attribution without collecting on creation',
      async () => {
        const result = await mutateContentIntake(
          {
            action: 'createSource',
            name: `Synthetic registry ${randomUUID()}`,
            type: 'manual',
            allowedHost: 'example.org',
            rightsNote: 'Synthetic manual fixture with explicit use conditions.',
          },
          admin,
        );
        assert.ok(result && 'sourceId' in result);
        sourceIds.push(result.sourceId);
        const source = await db.contentSource.findUniqueOrThrow({ where: { id: result.sourceId } });
        assert.equal(source.enabled, false);
        assert.equal(source.type, 'manual');
        assert.equal(source.feedUrl, null);
        assert.equal(await db.crawlRun.count({ where: { sourceId: source.id } }), 0);
        const audit = await db.contentAudit.findFirstOrThrow({
          where: { sourceId: source.id, action: 'source_created' },
        });
        assert.equal(audit.actorId, admin.id);
      },
    );

    await t.test(
      'manual entry deduplicates URLs, appends revisions and never resurrects closed items',
      async () => {
        await setEnabled(true);
        const source = await createSource('manual');
        const input = {
          action: 'addManualContent',
          sourceId: source.id,
          url: `https://example.org/manual/${randomUUID()}?utm_source=integration`,
          title: 'Synthetic student opportunity',
          summary: 'Initial description',
          category: 'hackathon',
        };
        const prefix = 'https://example.org/';
        const tooLongUrl = prefix + 'x'.repeat(2001 - prefix.length);
        await assert.rejects(
          mutateContentIntake({ ...input, url: tooLongUrl }, admin),
          (error: unknown) => {
            assert.equal(apiFailure(error, 'content.intake.url-regression').status, 400);
            return true;
          },
        );
        assert.equal(await db.contentItem.count({ where: { sourceId: source.id } }), 0);
        const first = await mutateContentIntake(input, admin);
        assert.ok(first && 'kind' in first && 'itemId' in first);
        assert.equal(first.kind, 'created');
        const repeat = await mutateContentIntake({ ...input, url: input.url.split('?')[0] }, admin);
        assert.ok(repeat && 'kind' in repeat && 'itemId' in repeat);
        assert.equal(repeat.kind, 'duplicate');
        assert.equal(repeat.itemId, first.itemId);
        const updated = await mutateContentIntake(
          { ...input, title: 'Updated student opportunity' },
          admin,
        );
        assert.ok(updated && 'kind' in updated && 'itemId' in updated);
        assert.equal(updated.kind, 'updated');
        assert.equal(updated.itemId, first.itemId);
        const revisions = await db.contentRevision.findMany({
          where: { itemId: first.itemId },
          orderBy: { number: 'asc' },
        });
        assert.deepEqual(
          revisions.map((revision) => [revision.number, revision.title]),
          [
            [1, input.title],
            [2, 'Updated student opportunity'],
          ],
        );
        const reverted = await mutateContentIntake(input, admin);
        assert.ok(reverted && 'kind' in reverted);
        assert.equal(reverted.kind, 'updated');
        const repeatedRevert = await mutateContentIntake(input, admin);
        assert.ok(repeatedRevert && 'kind' in repeatedRevert);
        assert.equal(repeatedRevert.kind, 'duplicate');
        const revertedHistory = await db.contentRevision.findMany({
          where: { itemId: first.itemId },
          orderBy: { number: 'asc' },
        });
        assert.deepEqual(
          revertedHistory.map((revision) => [revision.number, revision.title]),
          [
            [1, input.title],
            [2, 'Updated student opportunity'],
            [3, input.title],
          ],
        );
        assert.equal(revertedHistory[0].contentHash, revertedHistory[2].contentHash);
        for (const status of ['rejected', 'archived', 'withdrawn']) {
          await db.contentItem.update({ where: { id: first.itemId }, data: { status } });
          const closed = await mutateContentIntake(
            { ...input, title: `Ignored revision for ${status}` },
            admin,
          );
          assert.ok(closed && 'kind' in closed);
          assert.equal(closed.kind, 'duplicate');
          assert.equal(
            (await db.contentItem.findUniqueOrThrow({ where: { id: first.itemId } })).status,
            status,
          );
        }
        assert.equal(await db.contentItem.count({ where: { sourceId: source.id } }), 1);
        assert.equal(await db.contentRevision.count({ where: { itemId: first.itemId } }), 3);
        assert.equal(
          await db.contentAudit.count({
            where: { itemId: first.itemId, action: 'manual_content_saved' },
          }),
          3,
        );
      },
    );

    await t.test('repeated manual sync requests reuse queued and running jobs', async () => {
      await setEnabled(true);
      const source = await createSource('rss');
      const request = () =>
        mutateContentIntake({ action: 'requestSync', sourceId: source.id }, admin);
      const first = await request();
      assert.ok(first && 'runId' in first);
      assert.equal(first.status, 'queued');
      const repeated = await request();
      assert.ok(repeated && 'runId' in repeated);
      assert.equal(repeated.runId, first.runId);
      const now = new Date();
      await db.crawlRun.update({
        where: { id: first.runId },
        data: {
          status: 'running',
          startedAt: now,
          leaseUntil: new Date(now.getTime() + 120000),
        },
      });
      const running = await request();
      assert.ok(running && 'runId' in running);
      assert.equal(running.runId, first.runId);
      assert.equal(running.status, 'running');
      assert.equal(await db.crawlRun.count({ where: { sourceId: source.id } }), 1);
      assert.equal(
        (await db.crawlRun.findUniqueOrThrow({ where: { id: first.runId } })).requestedById,
        admin.id,
      );
    });

    await t.test(
      'overlapping workers claim one source once while its fetch is in flight',
      async () => {
        await setEnabled(true);
        const source = await createSource('rss');
        let markFetchStarted!: () => void;
        let releaseFetch!: () => void;
        const fetchStarted = new Promise<void>((resolve) => {
          markFetchStarted = resolve;
        });
        const fetchReleased = new Promise<void>((resolve) => {
          releaseFetch = resolve;
        });
        let fetches = 0;
        const fetcher = async () => {
          fetches += 1;
          markFetchStarted();
          await fetchReleased;
          return successfulFeed(source.id)();
        };
        const first = runContentIntake(db, { sourceId: source.id, fetcher });
        let completed: Awaited<ReturnType<typeof runContentIntake>>;
        try {
          await Promise.race([
            fetchStarted,
            first.then((result) => {
              throw new Error(`First worker finished before entering the fetch: ${result.status}`);
            }),
          ]);
          const activeRuns = () =>
            db.crawlRun.count({
              where: { sourceId: source.id, status: { in: ['queued', 'running'] } },
            });
          assert.equal(await activeRuns(), 1);
          const second = await runContentIntake(db, { sourceId: source.id, fetcher });
          assert.equal(second.status, 'idle');
          assert.equal(fetches, 1);
          assert.equal(await activeRuns(), 1);
          assert.equal(await db.contentItem.count({ where: { sourceId: source.id } }), 0);
        } finally {
          // Always finish the first worker before fixture cleanup, even when an overlap assertion fails.
          releaseFetch();
          completed = await first;
        }
        assert.equal(completed.status, 'succeeded');
        assert.ok('created' in completed);
        assert.equal(completed.created, 1);
        assert.equal(fetches, 1);
        const runs = await db.crawlRun.findMany({ where: { sourceId: source.id } });
        assert.equal(runs.length, 1);
        assert.equal(runs[0].status, 'succeeded');
        assert.equal(runs[0].leaseUntil, null);
        assert.equal(await db.contentItem.count({ where: { sourceId: source.id } }), 1);
        assert.equal(
          await db.contentRevision.count({ where: { item: { sourceId: source.id } } }),
          1,
        );
      },
    );

    await t.test(
      'RSS success, repetition and changed content keep one unpublished item with ordered revisions',
      async () => {
        await setEnabled(true);
        const source = await createSource('rss');
        let fetches = 0;
        const fetcher = async (url: string, allowedHost: string) => {
          fetches += 1;
          assert.equal(url, source.feedUrl);
          assert.equal(allowedHost, source.allowedHost);
          return successfulFeed(source.id)();
        };
        const first = await runContentIntake(db, { sourceId: source.id, fetcher });
        assert.equal(first.status, 'succeeded');
        assert.ok('created' in first);
        assert.equal(first.created, 1);
        assert.equal(first.duplicates, 0);
        await makeDue(source.id);
        const repeat = await runContentIntake(db, { sourceId: source.id, fetcher });
        assert.equal(repeat.status, 'succeeded');
        assert.ok('duplicates' in repeat);
        assert.equal(repeat.duplicates, 1);
        assert.equal(repeat.created, 0);
        await makeDue(source.id);
        const changed = await runContentIntake(db, {
          sourceId: source.id,
          fetcher: successfulFeed(source.id, 'Changed student hackathon registration'),
        });
        assert.equal(changed.status, 'succeeded');
        assert.ok('updated' in changed);
        assert.equal(changed.updated, 1);
        const items = await db.contentItem.findMany({
          where: { sourceId: source.id },
          include: { revisions: { orderBy: { number: 'asc' } } },
        });
        assert.equal(items.length, 1);
        assert.equal(items[0].status, 'pending_review');
        assert.equal(items[0].canonicalUrl, `https://example.org/intake/${source.id}`);
        assert.deepEqual(
          items[0].revisions.map((revision) => revision.number),
          [1, 2],
        );
        assert.equal(items[0].revisions[0].publishedAt?.toISOString(), '2026-10-26T00:00:00.000Z');
        const savedSource = await db.contentSource.findUniqueOrThrow({ where: { id: source.id } });
        assert.ok(savedSource.lastSuccessAt);
        assert.ok(savedSource.nextRunAt && savedSource.nextRunAt > new Date());
        assert.equal(savedSource.consecutiveErrors, 0);
        assert.equal(fetches, 2);
        assert.equal(
          await db.contentAudit.count({
            where: { sourceId: source.id, action: 'rss_import_completed', actorId: null },
          }),
          3,
        );
      },
    );

    await t.test(
      'HTTP failure schedules backoff, respects Retry-After and does not block another source',
      async () => {
        await setEnabled(true);
        const source = await createSource('rss');
        const started = Date.now();
        let fetches = 0;
        const fetcher = async () => {
          fetches += 1;
          throw new ContentFetchError('FEED_HTTP_ERROR', 429, 120);
        };
        const result = await runContentIntake(db, { sourceId: source.id, fetcher });
        assert.equal(result.status, 'failed');
        assert.ok('runId' in result);
        const run = await db.crawlRun.findUniqueOrThrow({ where: { id: result.runId } });
        assert.equal(run.errorCode, 'FEED_HTTP_ERROR');
        assert.equal(run.httpStatus, 429);
        assert.equal(run.leaseUntil, null);
        const failedSource = await db.contentSource.findUniqueOrThrow({ where: { id: source.id } });
        assert.equal(failedSource.consecutiveErrors, 1);
        assert.equal(failedSource.lastSuccessAt, null);
        assert.ok(failedSource.nextRunAt && failedSource.nextRunAt.getTime() >= started + 120000);
        assert.equal((await runContentIntake(db, { sourceId: source.id, fetcher })).status, 'idle');
        await assert.rejects(
          mutateContentIntake({ action: 'requestSync', sourceId: source.id }, admin),
          rejectsStatus(429),
        );
        assert.equal(fetches, 1);
        const healthy = await createSource('rss');
        assert.equal(
          (
            await runContentIntake(db, {
              sourceId: healthy.id,
              fetcher: successfulFeed(healthy.id),
            })
          ).status,
          'succeeded',
        );
      },
    );

    await t.test(
      'fifth consecutive failure disables only that source and records the stop',
      async () => {
        await setEnabled(true);
        const source = await createSource('rss', { consecutiveErrors: 4 });
        const result = await runContentIntake(db, {
          sourceId: source.id,
          fetcher: async () => {
            throw new ContentFetchError('FEED_NETWORK_ERROR');
          },
        });
        assert.equal(result.status, 'failed');
        const disabled = await db.contentSource.findUniqueOrThrow({ where: { id: source.id } });
        assert.equal(disabled.enabled, false);
        assert.equal(disabled.consecutiveErrors, 5);
        assert.ok(disabled.nextRunAt && disabled.nextRunAt > new Date());
        const stopAudit = await db.contentAudit.findMany({
          where: { sourceId: source.id, actorId: null, action: 'source_suspended' },
        });
        assert.equal(
          stopAudit.length,
          1,
          'Automatic source suspension must remain in audit history.',
        );
        const healthy = await createSource('rss');
        assert.equal(
          (
            await runContentIntake(db, {
              sourceId: healthy.id,
              fetcher: successfulFeed(healthy.id),
            })
          ).status,
          'succeeded',
        );
        const cooldown = disabled.nextRunAt?.getTime();
        await mutateContentIntake(
          { action: 'setSourceEnabled', sourceId: source.id, enabled: true },
          admin,
        );
        const restored = await db.contentSource.findUniqueOrThrow({ where: { id: source.id } });
        assert.equal(restored.enabled, true);
        assert.equal(restored.consecutiveErrors, 0);
        assert.equal(restored.nextRunAt?.getTime(), cooldown);
      },
    );

    await t.test('module or source disabled during fetch cannot commit fetched items', async () => {
      for (const flag of ['module', 'source']) {
        await setEnabled(true);
        const source = await createSource('rss');
        let fetches = 0;
        const result = await runContentIntake(db, {
          sourceId: source.id,
          fetcher: async () => {
            fetches += 1;
            if (flag === 'module') await setEnabled(false);
            else
              await mutateContentIntake(
                { action: 'setSourceEnabled', sourceId: source.id, enabled: false },
                admin,
              );
            return successfulFeed(source.id)();
          },
        });
        assert.equal(fetches, 1);
        assert.equal(result.status, 'skipped');
        assert.ok('runId' in result);
        const run = await db.crawlRun.findUniqueOrThrow({ where: { id: result.runId } });
        assert.equal(run.status, 'skipped');
        assert.equal(run.errorCode, 'MODULE_OR_SOURCE_DISABLED');
        assert.equal(run.leaseUntil, null);
        assert.equal(await db.contentItem.count({ where: { sourceId: source.id } }), 0);
        assert.equal(
          (await db.contentSource.findUniqueOrThrow({ where: { id: source.id } })).lastSuccessAt,
          null,
        );
      }
    });

    await t.test(
      'expired lease is failed once, waits before retry and later recovers with a new run',
      async () => {
        await setEnabled(true);
        const source = await createSource('rss');
        const stale = await db.crawlRun.create({
          data: {
            sourceId: source.id,
            status: 'running',
            startedAt: new Date(Date.now() - 180000),
            leaseUntil: new Date(Date.now() - 60000),
          },
        });
        let fetches = 0;
        const fetcher = async () => {
          fetches += 1;
          return successfulFeed(source.id)();
        };
        assert.equal((await runContentIntake(db, { sourceId: source.id, fetcher })).status, 'idle');
        const expired = await db.crawlRun.findUniqueOrThrow({ where: { id: stale.id } });
        assert.equal(expired.status, 'failed');
        assert.equal(expired.errorCode, 'LEASE_EXPIRED');
        assert.equal(expired.leaseUntil, null);
        assert.ok(expired.finishedAt);
        assert.equal(
          (await db.contentSource.findUniqueOrThrow({ where: { id: source.id } }))
            .consecutiveErrors,
          1,
        );
        assert.equal((await runContentIntake(db, { sourceId: source.id, fetcher })).status, 'idle');
        assert.equal(fetches, 0);
        assert.equal(
          (await db.contentSource.findUniqueOrThrow({ where: { id: source.id } }))
            .consecutiveErrors,
          1,
        );
        await makeDue(source.id);
        const recovered = await runContentIntake(db, { sourceId: source.id, fetcher });
        assert.equal(recovered.status, 'succeeded');
        assert.ok('runId' in recovered);
        assert.notEqual(recovered.runId, stale.id);
        assert.equal(fetches, 1);
        assert.equal(
          (await db.contentSource.findUniqueOrThrow({ where: { id: source.id } }))
            .consecutiveErrors,
          0,
        );
      },
    );
  } finally {
    // No fixture history is deleted or rewritten, including append-only revisions and audit entries.
    await db.crawlRun.updateMany({
      where: { sourceId: { in: sourceIds }, status: { in: ['queued', 'running'] } },
      data: {
        status: 'skipped',
        finishedAt: new Date(),
        leaseUntil: null,
        errorCode: 'TEST_FIXTURE_FINISHED',
      },
    });
    await db.contentSource.updateMany({
      where: { id: { in: sourceIds } },
      data: { enabled: false },
    });
    await db.contentModuleSettings.update({
      where: { id: 'content' },
      data: { enabled: originalSettings.enabled },
    });
  }
});
