import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { after, test } from 'node:test';
import { db } from '../src/lib/db';
import { AppError } from '../src/lib/permissions';
import { mutateOpportunitySaves, queryOpportunitySaves } from '../src/server/content/saved';
import { runOpportunityDeadlineReminders } from '../src/server/content/deadline-reminders';

const target = new URL(process.env.DATABASE_URL || 'invalid:');
if (
  !/^\/student_marketplace_e2e(?:_content_[a-f0-9]{12})?$/.test(target.pathname) ||
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  process.env.DATABASE_TEST_URL !== process.env.DATABASE_URL
)
  throw Error('Isolated content test database required.');
after(() => db.$disconnect());
const DAY = 86_400_000;
const start = new Date();
const at = (days: number) => new Date(start.getTime() + days * DAY);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

test(
  'opt-in deadline reminders reach the local inbox once per deadline',
  { concurrency: false },
  async (t) => {
    const original = await db.contentModuleSettings.findUniqueOrThrow({ where: { id: 'content' } });
    await db.contentModuleSettings.update({ where: { id: 'content' }, data: { enabled: true } });
    const source = await db.contentSource.create({
      data: {
        name: 'Synthetic reminder source',
        type: 'manual',
        allowedHost: 'example.org',
        enabled: true,
        rightsNote: 'Synthetic isolated integration fixture only.',
      },
    });
    const userIds: string[] = [];
    async function fixture(options: { deadlineInDays: number | null; title?: string }) {
      const owner = await db.user.create({
        data: {
          id: randomUUID(),
          email: randomUUID() + '@example.test',
          name: 'Synthetic reminder owner',
          roles: [],
          emailVerified: true,
        },
      });
      userIds.push(owner.id);
      const id = randomUUID();
      const canonicalUrl = 'https://example.org/synthetic/' + id;
      await db.contentItem.create({
        data: { id, sourceId: source.id, canonicalUrl, urlHash: hash(id) },
      });
      const revision = await db.contentRevision.create({
        data: {
          itemId: id,
          number: 1,
          canonicalUrl,
          origin: 'manual',
          title: options.title ?? 'Reminder synthetic grant',
          summary: 'Synthetic public opportunity only.',
          category: 'grant',
          geography: '',
          language: 'ru',
          score: 50,
          contentHash: hash(id),
          deadline: options.deadlineInDays === null ? null : at(options.deadlineInDays),
        },
      });
      await db.contentItem.update({
        where: { id },
        data: {
          status: 'published',
          approvedRevisionId: revision.id,
          approvedAt: at(-1),
          expiresAt: at(90),
        },
      });
      await mutateOpportunitySaves(db, owner, { action: 'saveFavorite', itemId: id });
      const favorite = await db.opportunityFavorite.findFirstOrThrow({
        where: { userId: owner.id, itemId: id },
      });
      const remind = (daysBefore: 1 | 3 | 7 | null) =>
        mutateOpportunitySaves(db, owner, {
          action: 'setFavoriteReminder',
          favoriteId: favorite.id,
          daysBefore,
        });
      const run = (now: Date) =>
        runOpportunityDeadlineReminders(db, { now, favoriteIds: [favorite.id] });
      const inbox = () => db.notification.findMany({ where: { userId: owner.id } });
      // Revisions are append-only: an editor moves a deadline with a new approved revision.
      const moveDeadline = async (days: number) => {
        const next = await db.contentRevision.create({
          data: {
            itemId: id,
            number: 2,
            canonicalUrl,
            origin: 'editorial',
            title: revision.title,
            summary: revision.summary,
            category: 'grant',
            geography: '',
            language: 'ru',
            score: 50,
            contentHash: hash(randomUUID()),
            deadline: at(days),
          },
        });
        await db.contentItem.update({ where: { id }, data: { approvedRevisionId: next.id } });
      };
      return { owner, id, favorite, remind, run, inbox, moveDeadline };
    }
    try {
      await t.test('a reminder needs a confirmed future deadline and a valid offset', async () => {
        const undated = await fixture({ deadlineInDays: null });
        await assert.rejects(
          undated.remind(3),
          (error) => error instanceof AppError && error.status === 409,
        );
        const dated = await fixture({ deadlineInDays: 10 });
        await assert.rejects(
          mutateOpportunitySaves(db, dated.owner, {
            action: 'setFavoriteReminder',
            favoriteId: dated.favorite.id,
            daysBefore: 5,
          }),
        );
        await dated.remind(3);
        const saved = await queryOpportunitySaves(db, dated.owner);
        assert.equal(saved.favorites[0].reminderDaysBefore, 3);
      });

      await t.test('delivery waits for the window and is not repeated', async () => {
        const f = await fixture({ deadlineInDays: 10, title: 'Grant for reminders' });
        await f.remind(3);
        assert.equal((await f.run(at(5))).notificationsCreated, 0);
        assert.equal((await f.run(at(8))).notificationsCreated, 1);
        const [message] = await f.inbox();
        assert.match(message.text, /Grant for reminders/);
        assert.equal(message.url, `/opportunities/${f.id}?from=%2Fopportunities%2Fsaved`);
        // A repeated pass and a retried identical choice change nothing.
        assert.equal((await f.run(at(8.5))).notificationsCreated, 0);
        await f.remind(3);
        assert.equal((await f.run(at(9))).notificationsCreated, 0);
        assert.equal((await f.inbox()).length, 1);
      });

      await t.test('a moved deadline reminds again and a passed one never does', async () => {
        const f = await fixture({ deadlineInDays: 10 });
        await f.remind(1);
        assert.equal((await f.run(at(9.5))).notificationsCreated, 1);
        await f.moveDeadline(30);

        assert.equal((await f.run(at(10))).notificationsCreated, 0);
        assert.equal((await f.run(at(29.5))).notificationsCreated, 1);
        assert.equal((await f.inbox()).length, 2);
        assert.equal((await f.run(at(31))).notificationsCreated, 0);
      });

      await t.test('changing or removing the choice resets or stops the reminder', async () => {
        const f = await fixture({ deadlineInDays: 10 });
        await f.remind(7);
        assert.equal((await f.run(at(4))).notificationsCreated, 1);
        await f.remind(1);
        assert.equal((await f.run(at(5))).notificationsCreated, 0);
        assert.equal((await f.run(at(9.5))).notificationsCreated, 1);
        await f.remind(null);
        await f.moveDeadline(40);

        assert.equal((await f.run(at(39.5))).notificationsCreated, 0);
      });

      await t.test('withdrawn items and suspended accounts receive nothing', async () => {
        const gone = await fixture({ deadlineInDays: 10 });
        await gone.remind(3);
        await db.contentItem.update({ where: { id: gone.id }, data: { status: 'withdrawn' } });
        assert.equal((await gone.run(at(9))).notificationsCreated, 0);
        const blocked = await fixture({ deadlineInDays: 10 });
        await blocked.remind(3);
        await db.user.update({ where: { id: blocked.owner.id }, data: { status: 'suspended' } });
        const result = await blocked.run(at(8));
        assert.equal(result.notificationsCreated, 0);
        assert.equal(result.scannedReminders, 1);
        assert.equal((await blocked.inbox()).length, 0);
      });

      await t.test('invalid options fail before database changes', async () => {
        await assert.rejects(
          () => runOpportunityDeadlineReminders(db, { batchSize: 0 }),
          RangeError,
        );
        await assert.rejects(
          () => runOpportunityDeadlineReminders(db, { now: new Date(Number.NaN) }),
          RangeError,
        );
      });
    } finally {
      await db.opportunityFavorite.deleteMany({ where: { userId: { in: userIds } } });
      await db.contentModuleSettings.update({
        where: { id: 'content' },
        data: { enabled: original.enabled },
      });
    }
  },
);
