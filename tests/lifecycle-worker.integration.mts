import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { runProjectLifecycle, LIFECYCLE_LOCK_KEYS } from '../src/server/lifecycle/worker';

const target = new URL(process.env.DATABASE_TEST_URL ?? 'invalid:');
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/student_marketplace_e2e'
)
  throw new Error('Explicit local E2E database required.');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.toString(), options: '-c timezone=UTC' }),
});
after(() => db.$disconnect());
const now = new Date();
async function fixture() {
  const client = await db.user.create({
    data: {
      id: randomUUID(),
      name: 'Worker test client',
      email: `${randomUUID()}@example.test`,
      roles: ['client'],
    },
  });
  const student = await db.user.create({
    data: {
      id: randomUUID(),
      name: 'Worker test student',
      email: `${randomUUID()}@example.test`,
      roles: ['student'],
    },
  });
  const create = (
    hours: number,
    status: 'published' | 'in_progress' | 'submitted' | 'cancelled' = 'published',
  ) =>
    db.project.create({
      data: {
        clientId: client.id,
        title: 'Synthetic lifecycle test',
        category: 'design',
        problem: 'Test problem',
        description: 'Synthetic data only',
        deliverables: 'Test result',
        acceptanceCriteria: ['Test criterion'],
        budgetKzt: 1000,
        estimatedHours: 1,
        dueAt: new Date(now.getTime() + hours * 3600000),
        publishedAt: now,
        status,
        ...(status === 'in_progress' || status === 'submitted'
          ? { assignedStudentId: student.id }
          : {}),
      },
    });
  return { client, student, create };
}

test('real expiry/reminders commit once, retain read history and stop after cancellation', async () => {
  const f = await fixture();
  const expired = await f.create(-1),
    soon = await f.create(1),
    work = await f.create(2, 'in_progress'),
    review = await f.create(24, 'submitted');
  await db.application.create({
    data: { projectId: expired.id, studentId: f.student.id, message: 'Synthetic application' },
  });
  await db.agreementVersion.create({
    data: {
      projectId: work.id,
      number: 1,
      snapshotJson: { dueAt: work.dueAt.toISOString() },
      clientApprovedAt: now,
      studentApprovedAt: now,
    },
  });
  await db.submission.create({
    data: {
      projectId: review.id,
      studentId: f.student.id,
      links: [],
      notes: 'Synthetic review',
      createdAt: new Date(now.getTime() - 49 * 3600000),
    },
  });
  const ids = [expired.id, soon.id, work.id, review.id];
  const first = await runProjectLifecycle(db, { now, projectIds: ids });
  assert.equal(first.expiredProjects, 1);
  assert.equal(first.remindersCreated, 3);
  assert.equal(
    (await db.project.findUniqueOrThrow({ where: { id: expired.id } })).status,
    'expired',
  );
  assert.equal(
    (await db.application.findFirstOrThrow({ where: { projectId: expired.id } })).status,
    'not_selected',
  );
  const event = await db.projectEvent.findFirstOrThrow({
    where: { projectId: expired.id },
    include: { actor: true },
  });
  assert.equal(event.actorId, null);
  assert.equal(event.actor, null);
  const notifications = await db.notification.findMany({
    where: { userId: { in: [f.client.id, f.student.id] } },
  });
  assert.equal(notifications.length, 5);
  await db.notification.updateMany({ where: { userId: f.client.id }, data: { readAt: now } });
  await db.project.update({ where: { id: soon.id }, data: { status: 'cancelled' } });
  const repeated = await runProjectLifecycle(db, {
    now: new Date(now.getTime() + 60000),
    projectIds: ids,
  });
  assert.equal(repeated.remindersCreated, 0);
  assert.equal(repeated.expiredProjects, 0);
  assert.equal(
    await db.notification.count({ where: { userId: { in: [f.client.id, f.student.id] } } }),
    5,
  );
});

test('parallel workers and a held transaction lock cannot duplicate work', async () => {
  const f = await fixture(),
    project = await f.create(-1);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${LIFECYCLE_LOCK_KEYS[0]}::integer, ${LIFECYCLE_LOCK_KEYS[1]}::integer)`;
    const busy = await runProjectLifecycle(db, { now, projectIds: [project.id] });
    assert.equal(busy.status, 'busy');
    assert.equal(
      (await tx.project.findUniqueOrThrow({ where: { id: project.id } })).status,
      'published',
    );
  });
  await Promise.all([
    runProjectLifecycle(db, { now, projectIds: [project.id] }),
    runProjectLifecycle(db, { now, projectIds: [project.id] }),
  ]);
  assert.equal(
    await db.projectEvent.count({ where: { projectId: project.id, action: 'project_expired' } }),
    1,
  );
  assert.equal(await db.notification.count({ where: { userId: f.client.id } }), 1);
});

test('an interrupted write rolls back status, history and notification, then recovers', async () => {
  const f = await fixture(),
    project = await f.create(-1);
  const failing = {
    backgroundJobRun: db.backgroundJobRun,
    $transaction: (
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: { isolationLevel: Prisma.TransactionIsolationLevel },
    ) =>
      db.$transaction(
        (tx) =>
          callback(
            new Proxy(tx, {
              get(target, property) {
                if (property === 'notification')
                  return {
                    createMany: async () => {
                      throw new Error('Injected failure');
                    },
                  };
                return Reflect.get(target, property);
              },
            }),
          ),
        options,
      ),
  } as unknown as PrismaClient;
  await assert.rejects(runProjectLifecycle(failing, { now, projectIds: [project.id] }));
  assert.equal(
    (await db.project.findUniqueOrThrow({ where: { id: project.id } })).status,
    'published',
  );
  assert.equal(await db.projectEvent.count({ where: { projectId: project.id } }), 0);
  assert.equal(await db.notification.count({ where: { userId: f.client.id } }), 0);
  assert.equal(
    (await runProjectLifecycle(db, { now, projectIds: [project.id] })).expiredProjects,
    1,
  );
});

test('cursor advances past already-processed projects and closed projects stay untouched', async () => {
  const f = await fixture();
  const projects = await Promise.all([f.create(72), f.create(72), f.create(72)]);
  const visited = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const run = await runProjectLifecycle(db, {
      now,
      projectIds: projects.map((p) => p.id),
      batchSize: 1,
    });
    assert.equal(run.scannedProjects, 1);
    visited.add(run.nextCursor!);
  }
  assert.equal(visited.size, 3);
  const cancelled = await f.create(-1, 'cancelled');
  await runProjectLifecycle(db, { now, projectIds: [cancelled.id] });
  assert.equal(
    (await db.project.findUniqueOrThrow({ where: { id: cancelled.id } })).status,
    'cancelled',
  );
  assert.equal(await db.notification.count({ where: { userId: f.client.id } }), 0);
});
