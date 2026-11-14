import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { config } from '@/lib/config';
import { getNotificationLanguage } from '@/server/notification-language';
import { opportunityDeadlineText } from '@/lib/notification-language';
import { OPPORTUNITY_NOTIFICATION_LOCK_KEYS } from './search-notifications';

const MAX_ATTEMPTS = 3;
const DAY = 24 * 60 * 60 * 1000;

export interface DeadlineReminderOptions {
  /** Internal deterministic clock for isolated tests, never accepted from a request. */
  now?: Date;
  batchSize?: number;
  /** Isolated integration fixtures; normal workers examine every due reminder. */
  favoriteIds?: string[];
}

/**
 * Sends the opt-in deadline reminders of saved opportunities to the local inbox.
 * A reminder is due once the confirmed deadline is within the chosen number of days and the
 * deadline has not passed. Delivery and the record of the reminded deadline commit together.
 */
export async function runOpportunityDeadlineReminders(
  database: PrismaClient,
  options: DeadlineReminderOptions = {},
) {
  const batchSize = options.batchSize ?? 20;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50)
    throw new RangeError('Deadline reminder batch size must be 1..50.');
  if (options.now && !Number.isFinite(options.now.getTime()))
    throw new RangeError('Invalid deadline reminder clock.');
  if (
    options.favoriteIds &&
    (options.favoriteIds.length > 500 ||
      options.favoriteIds.some((id) => typeof id !== 'string' || !id || id.length > 100))
  )
    throw new RangeError('Invalid deadline reminder scope.');

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await database.$transaction(
        async (tx) => {
          const counts = { scannedReminders: 0, notificationsCreated: 0 };
          const [lock] = await tx.$queryRaw<
            { locked: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(${OPPORTUNITY_NOTIFICATION_LOCK_KEYS[0]}::integer, ${OPPORTUNITY_NOTIFICATION_LOCK_KEYS[1]}::integer) AS locked`;
          if (!lock.locked) return { status: 'busy' as const, ...counts };
          // Editorial changes take this lock too, so a withdrawal is seen before or after delivery.
          await tx.$queryRaw`SELECT "id" FROM "ContentModuleSettings" WHERE "id" = 'content' FOR UPDATE`;
          const settings = await tx.contentModuleSettings.findUnique({ where: { id: 'content' } });
          if (!settings?.enabled) return { status: 'disabled' as const, ...counts };
          const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          const now = options.now ?? clock.now;
          // Timestamps are stored in UTC without a zone, as everywhere else in the content tables.
          const due = await tx.$queryRaw<
            {
              id: string;
              userId: string;
              itemId: string;
              title: string;
              deadline: Date;
              reminderDaysBefore: number;
            }[]
          >(Prisma.sql`
            SELECT f.id, f."userId", f."itemId", r."title", r."deadline", f."reminderDaysBefore"
            FROM "OpportunityFavorite" f
            JOIN "ContentItem" i ON i.id = f."itemId"
            JOIN "ContentSource" s ON s.id = i."sourceId"
            JOIN "ContentRevision" r ON r.id = i."approvedRevisionId"
            WHERE f."reminderDaysBefore" IS NOT NULL
              AND i."status" = 'published' AND s."enabled" = true
              AND i."expiresAt" > ${now} AND r."canonicalUrl" IS NOT NULL
              AND r."deadline" IS NOT NULL AND r."deadline" > ${now}
              AND r."deadline" - (f."reminderDaysBefore" * interval '1 day') <= ${now}
              AND (f."reminderDeadline" IS NULL OR f."reminderDeadline" <> r."deadline")
              ${options.favoriteIds ? Prisma.sql`AND f.id IN (${Prisma.join(options.favoriteIds)})` : Prisma.empty}
            ORDER BY r."deadline" ASC, f.id ASC
            LIMIT ${batchSize}
          `);
          for (const reminder of due) {
            counts.scannedReminders += 1;
            const user = await tx.user.findUnique({
              where: { id: reminder.userId },
              select: { status: true, demo: true },
            });
            if (user?.status === 'active' && (!user.demo || config.demoEnabled)) {
              const daysLeft = Math.max(
                1,
                Math.ceil((reminder.deadline.getTime() - now.getTime()) / DAY),
              );
              const delivered = await tx.notification.createMany({
                data: [
                  {
                    userId: reminder.userId,
                    text: opportunityDeadlineText(
                      await getNotificationLanguage(tx, reminder.userId),
                      reminder.title,
                      daysLeft,
                    ),
                    url: `/opportunities/${encodeURIComponent(reminder.itemId)}?from=${encodeURIComponent('/opportunities/saved')}`,
                    dedupeKey: `opportunity-deadline:${reminder.id}:${reminder.reminderDaysBefore}:${reminder.deadline.toISOString()}`,
                  },
                ],
                skipDuplicates: true,
              });
              counts.notificationsCreated += delivered.count;
            }
            // Blocked recipients are marked too, so they cannot hold the batch back.
            await tx.opportunityFavorite.update({
              where: { id: reminder.id },
              data: { reminderDeadline: reminder.deadline },
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
  throw new Error('Deadline reminder retry limit exceeded.');
}
