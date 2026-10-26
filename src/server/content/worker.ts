import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { parseHtmlOpportunities } from '@/lib/content-html';
import { parseFeed } from '@/lib/content-feed';
import { fetchFeed, ContentFetchError } from './fetch-feed';
import { storeContentItem } from './service';

const LEASE_MS = 120000;
const MAX_CONSECUTIVE_FAILURES = 5;
const LOCK = [5328723, 20] as const;
type Options = { fetcher?: typeof fetchFeed; sourceId?: string };
const finishRun = (status: 'succeeded' | 'failed' | 'skipped') => ({
  status,
  finishedAt: new Date(),
  leaseUntil: null,
});

async function recordSourceFailure(
  tx: Prisma.TransactionClient,
  sourceId: string,
  nextRunAt: Date,
) {
  const source = await tx.contentSource.update({
    where: { id: sourceId },
    data: { lastCheckedAt: new Date(), nextRunAt, consecutiveErrors: { increment: 1 } },
  });
  if (source.consecutiveErrors >= MAX_CONSECUTIVE_FAILURES) {
    await tx.contentSource.update({ where: { id: sourceId }, data: { enabled: false } });
    await tx.contentAudit.create({
      data: {
        sourceId,
        action: 'source_suspended',
        reason: 'Пять последовательных ошибок: требуется проверка источника администратором.',
      },
    });
  }
}

/** Claim in a short transaction; no SQL transaction or lock is held across external HTTPS. */
export async function runContentIntake(database: PrismaClient, options: Options = {}) {
  const claim = await database.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(${LOCK[0]}::integer, ${LOCK[1]}::integer) AS locked`;
      if (!lock.locked) return null;
      // Expiry does not depend on the source being due or the intake being enabled.
      // The public query also filters expiry immediately, even when this worker is stopped.
      await tx.$queryRaw`SELECT "id" FROM "ContentModuleSettings" WHERE "id" = 'content' FOR UPDATE`;
      const expired = await tx.contentItem.findMany({
        where: { status: 'published', expiresAt: { lte: new Date() } },
        take: 100,
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      });
      for (const item of expired) {
        await tx.contentItem.update({ where: { id: item.id }, data: { status: 'archived' } });
        await tx.contentAudit.create({
          data: {
            itemId: item.id,
            sourceId: item.sourceId,
            revisionId: item.approvedRevisionId,
            action: 'content_expired',
            reason: 'Истёк подтверждённый срок актуальности публикации.',
          },
        });
      }
      const settings = await tx.contentModuleSettings.findUnique({ where: { id: 'content' } });
      if (!settings?.enabled) return null;
      const now = new Date();
      // Expired leases become visible failures. A late old worker cannot commit to a terminal run.
      const stale = await tx.crawlRun.findMany({
        where: { status: 'running', leaseUntil: { lte: now } },
        take: 100,
      });
      for (const run of stale) {
        await tx.crawlRun.update({
          where: { id: run.id },
          data: { ...finishRun('failed'), errorCode: 'LEASE_EXPIRED' },
        });
        await recordSourceFailure(tx, run.sourceId, new Date(now.getTime() + 60000));
      }
      const queued = await tx.crawlRun.findFirst({
        where: { status: 'queued', ...(options.sourceId ? { sourceId: options.sourceId } : {}) },
        orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
        include: { source: true },
      });
      if (queued && !queued.source.enabled) {
        await tx.crawlRun.update({
          where: { id: queued.id },
          data: { ...finishRun('skipped'), errorCode: 'SOURCE_DISABLED' },
        });
        return null;
      }
      const source =
        queued?.source ??
        (await tx.contentSource.findFirst({
          where: {
            enabled: true,
            type: { in: ['rss', 'html'] },
            ...(options.sourceId ? { id: options.sourceId } : {}),
            OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
            runs: { none: { status: { in: ['queued', 'running'] } } },
          },
          orderBy: [
            { nextRunAt: { sort: 'asc', nulls: 'first' } },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
        }));
      if (!source) return null;
      const run =
        queued ?? (await tx.crawlRun.create({ data: { sourceId: source.id, status: 'queued' } }));
      await tx.crawlRun.update({
        where: { id: run.id },
        data: { status: 'running', startedAt: now, leaseUntil: new Date(now.getTime() + LEASE_MS) },
      });
      return { source, runId: run.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
  );
  if (!claim) return { status: 'idle' as const };
  const { source, runId } = claim;
  try {
    // Recheck flags immediately before the network request as well as before committing results.
    const [settings, current] = await Promise.all([
      database.contentModuleSettings.findUnique({ where: { id: 'content' } }),
      database.contentSource.findUnique({ where: { id: source.id } }),
    ]);
    if (!settings?.enabled || !current?.enabled || !source.feedUrl) {
      await database.crawlRun.update({
        where: { id: runId },
        data: { ...finishRun('skipped'), errorCode: 'MODULE_OR_SOURCE_DISABLED' },
      });
      return { status: 'skipped' as const, runId };
    }
    const response = await (options.fetcher ?? fetchFeed)(source.feedUrl, source.allowedHost, {
      format: source.type === 'html' ? 'html' : 'xml',
    });
    const parsed =
      response.status === 304
        ? { items: [], found: 0, discarded: 0 }
        : (source.type === 'html' ? parseHtmlOpportunities : parseFeed)(
            response.body,
            source.feedUrl,
            source.allowedHost,
            source.maxItems,
          );
    return await database.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "ContentModuleSettings" WHERE "id" = 'content' FOR UPDATE`;
        const enabled = await tx.contentModuleSettings.findUnique({ where: { id: 'content' } });
        const activeSource = await tx.contentSource.findUniqueOrThrow({ where: { id: source.id } });
        const run = await tx.crawlRun.findUniqueOrThrow({ where: { id: runId } });
        if (run.status !== 'running' || !run.leaseUntil || run.leaseUntil <= new Date())
          return { status: 'skipped' as const, runId };
        if (!enabled?.enabled || !activeSource.enabled) {
          await tx.crawlRun.update({
            where: { id: runId },
            data: { ...finishRun('skipped'), errorCode: 'MODULE_OR_SOURCE_DISABLED' },
          });
          return { status: 'skipped' as const, runId };
        }
        const counts = { created: 0, updated: 0, duplicates: 0 };
        for (const item of parsed.items) {
          const result = await storeContentItem(tx, source.id, item);
          counts[result.kind === 'duplicate' ? 'duplicates' : result.kind] += 1;
        }
        const finished = new Date();
        await tx.crawlRun.update({
          where: { id: runId },
          data: {
            ...finishRun('succeeded'),
            found: parsed.found,
            discarded: parsed.discarded,
            ...counts,
            httpStatus: response.status,
          },
        });
        await tx.contentSource.update({
          where: { id: source.id },
          data: {
            lastCheckedAt: finished,
            lastSuccessAt: finished,
            consecutiveErrors: 0,
            nextRunAt: new Date(finished.getTime() + source.intervalMinutes * 60000),
          },
        });
        await tx.contentAudit.create({
          data: {
            sourceId: source.id,
            actorId: null,
            action: 'rss_import_completed',
            reason: 'RSS проверен; материалы находятся только в закрытой очереди.',
          },
        });
        return { status: 'succeeded' as const, runId, ...counts };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
    );
  } catch (error) {
    const code =
      error instanceof ContentFetchError
        ? error.code
        : error instanceof Prisma.PrismaClientKnownRequestError
          ? 'DATABASE_ERROR'
          : 'INVALID_FEED';
    const retrySeconds = error instanceof ContentFetchError ? error.retryAfterSeconds : undefined;
    const backoffMs = Math.max(
      Math.min(3600000, 60000 * 2 ** Math.min(source.consecutiveErrors, 6)),
      (retrySeconds ?? 0) * 1000,
    );
    await database.$transaction(async (tx) => {
      const failed = await tx.crawlRun.updateMany({
        where: { id: runId, status: 'running' },
        data: {
          ...finishRun('failed'),
          errorCode: code,
          httpStatus: error instanceof ContentFetchError ? (error.httpStatus ?? null) : null,
        },
      });
      if (failed.count) await recordSourceFailure(tx, source.id, new Date(Date.now() + backoffMs));
    });
    return { status: 'failed' as const, runId, errorCode: code };
  }
}
