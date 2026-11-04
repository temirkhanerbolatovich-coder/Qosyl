import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { config } from '@/lib/config';
import { getNotificationLanguage } from '@/server/notification-language';
import { opportunityNotificationText } from '@/lib/notification-language';
import {
  normalizeOpportunityFilters,
  opportunityNotificationDelay,
  opportunitySearchUrl,
} from '@/lib/opportunity-saved';
import { opportunityMatchClauses } from './search';

export const OPPORTUNITY_NOTIFICATION_LOCK_KEYS = [5_328_723, 12] as const;
const MAX_MATCHES_PER_PERIOD = 50;
const MAX_ATTEMPTS = 3;

export interface OpportunityNotificationOptions {
  /** Internal deterministic clock for isolated tests, never accepted from a request. */
  now?: Date;
  batchSize?: number;
  /** Isolated integration fixtures; normal workers examine all due searches. */
  searchIds?: string[];
}

/** Local inbox delivery, match identities and scheduling commit in one bounded transaction. */
export async function runOpportunitySearchNotifications(
  database: PrismaClient,
  options: OpportunityNotificationOptions = {},
) {
  const batchSize = options.batchSize ?? 10;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20)
    throw new RangeError('Opportunity notification batch size must be 1..20.');
  if (options.now && !Number.isFinite(options.now.getTime()))
    throw new RangeError('Invalid opportunity notification clock.');
  if (
    options.searchIds &&
    (options.searchIds.length > 500 ||
      options.searchIds.some((id) => typeof id !== 'string' || !id || id.length > 100))
  )
    throw new RangeError('Invalid opportunity notification search scope.');

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await database.$transaction(
        async (tx) => {
          const counts = { scannedSearches: 0, notificationsCreated: 0, matchesRecorded: 0 };
          const [lock] = await tx.$queryRaw<
            { locked: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(${OPPORTUNITY_NOTIFICATION_LOCK_KEYS[0]}::integer, ${OPPORTUNITY_NOTIFICATION_LOCK_KEYS[1]}::integer) AS locked`;
          if (!lock.locked) return { status: 'busy' as const, ...counts };

          // Editorial mutations take this same lock. A withdrawal or switch is observed
          // wholly before or after delivery, never halfway through the visibility check.
          await tx.$queryRaw`SELECT "id" FROM "ContentModuleSettings" WHERE "id" = 'content' FOR UPDATE`;
          const settings = await tx.contentModuleSettings.findUnique({ where: { id: 'content' } });
          if (!settings?.enabled) return { status: 'disabled' as const, ...counts };
          const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          const now = options.now ?? clock.now;
          const due = await tx.savedOpportunitySearch.findMany({
            where: {
              notificationFrequency: { in: ['daily', 'weekly'] },
              nextNotificationAt: { lte: now },
              ...(options.searchIds ? { id: { in: options.searchIds } } : {}),
            },
            orderBy: [{ nextNotificationAt: 'asc' }, { id: 'asc' }],
            select: { id: true, userId: true },
            take: batchSize,
          });
          for (const candidate of due) {
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${candidate.userId} FOR UPDATE`;
            await tx.$queryRaw`SELECT "id" FROM "SavedOpportunitySearch" WHERE "id" = ${candidate.id} FOR UPDATE`;
            const search = await tx.savedOpportunitySearch.findUnique({
              where: { id: candidate.id },
              include: { user: { select: { status: true, demo: true } } },
            });
            if (
              !search ||
              !['daily', 'weekly'].includes(search.notificationFrequency) ||
              !search.notificationSince ||
              !search.nextNotificationAt ||
              search.nextNotificationAt > now
            )
              continue;
            counts.scannedSearches += 1;
            const nextNotificationAt = new Date(
              now.getTime() +
                opportunityNotificationDelay[search.notificationFrequency as 'daily' | 'weekly'],
            );
            if (search.user.status === 'active' && (!search.user.demo || config.demoEnabled)) {
              const filters = normalizeOpportunityFilters({
                q: search.q,
                geography: search.geography,
                ...(search.category ? { category: search.category } : {}),
                ...(search.specialty ? { specialty: search.specialty } : {}),
              });
              const clauses = [
                Prisma.sql`i."status" = 'published' AND s."enabled" = true`,
                Prisma.sql`i."expiresAt" > ${now} AND i."approvedAt" > ${search.notificationSince}`,
                Prisma.sql`i."approvedAt" <= ${now} AND r."canonicalUrl" IS NOT NULL`,
                Prisma.sql`NOT EXISTS (SELECT 1 FROM "OpportunitySearchMatch" m WHERE m."searchId" = ${search.id} AND m."itemId" = i.id)`,
                ...opportunityMatchClauses(filters),
              ];
              const matches = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
                SELECT i.id FROM "ContentItem" i
                JOIN "ContentSource" s ON s.id = i."sourceId"
                JOIN "ContentRevision" r ON r.id = i."approvedRevisionId"
                WHERE ${Prisma.join(clauses, ' AND ')}
                ORDER BY i."approvedAt" ASC, i.id ASC LIMIT ${MAX_MATCHES_PER_PERIOD}
              `);
              if (matches.length) {
                const delivered = await tx.notification.createMany({
                  data: [
                    {
                      userId: search.userId,
                      text: opportunityNotificationText(
                        await getNotificationLanguage(tx, search.userId),
                        matches.length,
                      ),
                      url: opportunitySearchUrl(filters),
                      dedupeKey: `opportunity-search:${search.id}:${search.nextNotificationAt.toISOString()}`,
                    },
                  ],
                  skipDuplicates: true,
                });
                const recorded = await tx.opportunitySearchMatch.createMany({
                  data: matches.map(({ id }) => ({ searchId: search.id, itemId: id })),
                  skipDuplicates: true,
                });
                counts.notificationsCreated += delivered.count;
                counts.matchesRecorded += recorded.count;
              }
            }
            // Even suspended recipients advance, so a small blocked group cannot starve others.
            await tx.savedOpportunitySearch.update({
              where: { id: search.id },
              data: { nextNotificationAt },
            });
          }
          return { status: 'completed' as const, ...counts };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        attempt + 1 < MAX_ATTEMPTS
      )
        continue;
      throw error;
    }
  }
  throw new Error('Opportunity notification retry limit exceeded.');
}
