import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { planProjectLifecycle } from '@/lib/lifecycle-policy';

export const LIFECYCLE_LOCK_KEYS = [5_328_723, 11] as const;
export const LIFECYCLE_JOB = 'project-lifecycle';
const MAX_ATTEMPTS = 3;

export interface LifecycleOptions {
  /** Internal deterministic policy clock for tests; never accepted from an HTTP or CLI caller. */
  now?: Date;
  batchSize?: number;
  /** Narrow integration-test fixtures; normal workers scan the complete eligible dataset. */
  projectIds?: string[];
}

function errorCode(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && /^P\d{4}$/.test(error.code))
    return error.code;
  return 'WORKER_ERROR';
}

/** A bounded transaction owns the advisory lock and all state/notification writes atomically. */
export async function runProjectLifecycle(database: PrismaClient, options: LifecycleOptions = {}) {
  const batchSize = options.batchSize ?? 50;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50)
    throw new RangeError('Lifecycle batch size must be 1..50.');
  if (options.now && !Number.isFinite(options.now.getTime()))
    throw new RangeError('Invalid lifecycle clock.');
  if (
    options.projectIds &&
    (options.projectIds.length > 500 || options.projectIds.some((id) => !id || id.length > 100))
  )
    throw new RangeError('Invalid lifecycle project scope.');
  const startedAt = new Date();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await database.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<
            { locked: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(${LIFECYCLE_LOCK_KEYS[0]}::integer, ${LIFECYCLE_LOCK_KEYS[1]}::integer) AS locked`;
          if (!lock.locked)
            return tx.backgroundJobRun.create({
              data: {
                job: LIFECYCLE_JOB,
                status: 'busy',
                startedAt,
                finishedAt: new Date(),
                expiredProjects: 0,
                remindersCreated: 0,
                scannedProjects: 0,
              },
            });

          const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          const now = options.now ?? clock.now;
          const previous = await tx.backgroundJobRun.findFirst({
            where: { job: LIFECYCLE_JOB, status: 'completed' },
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            select: { nextCursor: true },
          });
          const where: Prisma.ProjectWhereInput = {
            status: { in: ['published', 'in_progress', 'changes_requested', 'submitted'] },
            demo: false,
            client: { demo: false },
            OR: [{ assignedStudentId: null }, { assignedStudent: { demo: false } }],
            ...(options.projectIds ? { id: { in: options.projectIds } } : {}),
          };
          const loadIds = (cursor: string | null | undefined) =>
            tx.project.findMany({
              where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
              select: { id: true },
              orderBy: { id: 'asc' },
              take: batchSize,
            });
          let projects = await loadIds(previous?.nextCursor);
          if (!projects.length && previous?.nextCursor) projects = await loadIds(null);

          let expiredProjects = 0;
          let remindersCreated = 0;
          for (const { id } of projects) {
            // A concurrent cancel/assignment either precedes this lock or produces a serialization retry.
            await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${id} FOR UPDATE`;
            const project = await tx.project.findUnique({
              where: { id },
              include: {
                client: { select: { id: true, status: true, demo: true } },
                assignedStudent: { select: { id: true, status: true, demo: true } },
                agreements: {
                  where: { clientApprovedAt: { not: null }, studentApprovedAt: { not: null } },
                  orderBy: { number: 'desc' },
                  take: 1,
                  select: { id: true, snapshotJson: true },
                },
                submissions: {
                  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                  take: 1,
                  select: { id: true, createdAt: true },
                },
                applications: {
                  where: { status: 'active' },
                  select: { student: { select: { id: true, status: true, demo: true } } },
                },
              },
            });
            if (!project) continue;
            const plan = planProjectLifecycle(project, now);
            if (plan.skipReason)
              console.warn('lifecycle_project_skipped', { projectId: id, code: plan.skipReason });
            if (plan.expire) {
              const changed = await tx.project.updateMany({
                where: { id, status: 'published', assignedStudentId: null, dueAt: { lte: now } },
                data: { status: 'expired' },
              });
              if (!changed.count) continue;
              await tx.application.updateMany({
                where: { projectId: id, status: 'active' },
                data: { status: 'not_selected' },
              });
              await tx.projectEvent.create({
                data: {
                  projectId: id,
                  actorId: null,
                  action: 'project_expired',
                  metadataJson: { automatic: true, reason: 'Срок опубликованного задания истёк.' },
                },
              });
              expiredProjects += 1;
            }
            if (plan.notifications.length) {
              const created = await tx.notification.createMany({
                data: plan.notifications.map(({ userId, text, url, dedupeKey }) => ({
                  userId,
                  text,
                  url,
                  dedupeKey,
                })),
                skipDuplicates: true,
              });
              // Expiry notices are represented by expiredProjects; this counter covers the three reminders.
              if (!plan.expire) remindersCreated += created.count;
            }
          }
          return tx.backgroundJobRun.create({
            data: {
              job: LIFECYCLE_JOB,
              status: 'completed',
              startedAt,
              finishedAt: new Date(),
              expiredProjects,
              remindersCreated,
              scannedProjects: projects.length,
              nextCursor: projects.at(-1)?.id ?? null,
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        },
      );
    } catch (error) {
      if (errorCode(error) === 'P2034' && attempt + 1 < MAX_ATTEMPTS) continue;
      try {
        await database.backgroundJobRun.create({
          data: {
            job: LIFECYCLE_JOB,
            status: 'failed',
            startedAt,
            finishedAt: new Date(),
            expiredProjects: 0,
            remindersCreated: 0,
            scannedProjects: 0,
            errorCode: errorCode(error),
          },
        });
      } catch (logError) {
        console.error('lifecycle_failure_log_unavailable', { code: errorCode(logError) });
      }
      throw error;
    }
  }
  throw new Error('Lifecycle retry limit exceeded.');
}
