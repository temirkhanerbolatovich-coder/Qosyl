import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { after, test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { db } from '../src/lib/db';
import { AppError } from '../src/lib/permissions';
import { mutateOpportunitySaves } from '../src/server/content/saved';
import { opportunitySearchUrl } from '../src/lib/opportunity-saved';
import { runOpportunitySearchNotifications } from '../src/server/content/search-notifications';

const target = new URL(process.env.DATABASE_URL || 'invalid:');
if (
  !/^\/student_marketplace_e2e(?:_content_[a-f0-9]{12})?$/.test(target.pathname) ||
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  process.env.DATABASE_TEST_URL !== process.env.DATABASE_URL
)
  throw Error('Isolated content test database required.');
after(() => db.$disconnect());
const DAY = 86_400_000;
const now = new Date();
const at = (days: number) => new Date(now.getTime() + days * DAY);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

test(
  'opt-in opportunity search notifications use the local inbox safely',
  { concurrency: false },
  async (t) => {
    const original = await db.contentModuleSettings.findUniqueOrThrow({ where: { id: 'content' } });
    await db.contentModuleSettings.update({ where: { id: 'content' }, data: { enabled: true } });
    const sourceIds: string[] = [];
    async function fixture(frequency: 'off' | 'daily' | 'weekly' = 'daily') {
      const marker = randomUUID().replaceAll('-', '');
      const owner = await db.user.create({
        data: {
          id: randomUUID(),
          email: randomUUID() + '@example.test',
          name: 'Synthetic notification owner',
          roles: [],
          emailVerified: true,
        },
      });
      const source = await db.contentSource.create({
        data: {
          name: 'Synthetic notification source',
          type: 'manual',
          allowedHost: 'example.org',
          enabled: true,
          rightsNote: 'Synthetic isolated integration fixture only.',
        },
      });
      sourceIds.push(source.id);
      await mutateOpportunitySaves(db, owner, {
        action: 'saveSearch',
        name: 'PRIVATE_SEARCH_NAME',
        filters: { q: marker },
      });
      const search = await db.savedOpportunitySearch.findFirstOrThrow({
        where: { userId: owner.id },
      });
      if (frequency !== 'off')
        await db.savedOpportunitySearch.update({
          where: { id: search.id },
          data: {
            notificationFrequency: frequency,
            notificationSince: at(-2),
            nextNotificationAt: now,
          },
        });
      async function material(
        options: {
          title?: string;
          summary?: string;
          category?: string;
          geography?: string;
          approvedAt?: Date;
          expiresAt?: Date;
          status?: string;
        } = {},
      ) {
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
            title: options.title ?? `${marker} МЕДИЦИНА ГРАНТ ӘЛЕМ`,
            summary: options.summary ?? 'Synthetic public opportunity only.',
            category: options.category ?? 'grant',
            geography: options.geography ?? 'ҚАЗАҚСТАН АСТАНА',
            language: 'ru',
            score: 50,
            contentHash: hash(id),
          },
        });
        await db.contentItem.update({
          where: { id },
          data: {
            status: options.status ?? 'published',
            approvedRevisionId: revision.id,
            approvedAt: options.approvedAt ?? at(-1),
            expiresAt: options.expiresAt ?? at(30),
          },
        });
        return { id, revision };
      }
      const run = (date = now) =>
        runOpportunitySearchNotifications(db, { now: date, searchIds: [search.id] });
      const notices = () => db.notification.findMany({ where: { userId: owner.id } });
      return { owner, source, search, marker, material, run, notices };
    }
    try {
      await t.test('digest uses the recipient preference', async () => {
        const f = await fixture();
        await db.$executeRaw`INSERT INTO "NotificationPreference" ("userId", "language") VALUES (${f.owner.id}, 'kk')`;
        await f.material();
        assert.equal((await f.run()).notificationsCreated, 1);
        assert.match(
          (await f.notices())[0].text,
          /^Сақталған іздеу бойынша жаңа мүмкіндіктер: 1\./,
        );
      });
      await t.test(
        'saved searches default to off and do not backfill publications before the opt-in baseline',
        async () => {
          const f = await fixture('off');
          await f.material();
          assert.equal((await f.run()).scannedSearches, 0);
          assert.deepEqual(await f.notices(), []);
          const stored = await db.savedOpportunitySearch.findUniqueOrThrow({
            where: { id: f.search.id },
          });
          assert.equal(stored.notificationFrequency, 'off');
          assert.equal(stored.notificationSince, null);
          assert.equal(stored.nextNotificationAt, null);
          await db.savedOpportunitySearch.update({
            where: { id: f.search.id },
            data: {
              notificationFrequency: 'daily',
              notificationSince: now,
              nextNotificationAt: at(1),
            },
          });
          assert.equal((await f.run(at(1))).notificationsCreated, 0);
          await f.material({ approvedAt: at(1.1) });
          assert.equal((await f.run(at(2))).notificationsCreated, 1);
        },
      );

      await t.test(
        'shared matching respects every criterion and RU/KZ case, using approved snapshots',
        async () => {
          const f = await fixture();
          await db.savedOpportunitySearch.update({
            where: { id: f.search.id },
            data: {
              q: `${f.marker} грант әлем`,
              category: 'grant',
              geography: 'қазақстан',
              specialty: 'health',
            },
          });
          const match = await f.material({ title: `${f.marker} ГРАНТ ӘЛЕМ МЕДИЦИНА` });
          await f.material({ title: `${f.marker} ГРАНТ ӘЛЕМ ИНЖЕНЕРИЯ` });
          await f.material({ title: `${f.marker} ГРАНТ ӘЛЕМ МЕДИЦИНА`, category: 'news' });
          await f.material({
            title: `${f.marker} ГРАНТ ӘЛЕМ МЕДИЦИНА`,
            geography: 'Other country',
          });
          await f.material({ title: `${f.marker} МЕДИЦИНА ГРАНТ ӘЛЕМ` });
          await f.material({ title: `${f.marker} ГРАНТ ӘЛЕМ МЕДИЦИНА`, status: 'pending_review' });
          await db.contentRevision.create({
            data: {
              itemId: match.id,
              number: 2,
              canonicalUrl: 'https://example.org/PRIVATE_DRAFT_URL',
              origin: 'editorial',
              title: 'PRIVATE_DRAFT_TITLE',
              summary: 'PRIVATE_DRAFT_SUMMARY',
              category: 'article',
              geography: '',
              language: 'ru',
              score: 50,
              contentHash: hash(randomUUID()),
            },
          });
          const result = await f.run();
          assert.equal(result.matchesRecorded, 1);
          assert.deepEqual(
            (await db.opportunitySearchMatch.findMany({ where: { searchId: f.search.id } })).map(
              (m) => m.itemId,
            ),
            [match.id],
          );
          const [notice] = await f.notices();
          assert.ok(!notice.text.includes('PRIVATE_'));
          assert.ok(!notice.text.includes(f.marker));
          assert.equal(
            notice.url,
            opportunitySearchUrl({
              q: `${f.marker} грант әлем`,
              category: 'grant',
              geography: 'қазақстан',
              specialty: 'health',
            }),
          );
        },
      );

      await t.test(
        'withdrawal, expiry, source/module switches, future approvals and baseline entries are not delivered',
        async () => {
          const f = await fixture();
          await f.material({ status: 'withdrawn' });
          await f.material({ expiresAt: at(-0.5) });
          await f.material({ approvedAt: at(-3) });
          await f.material({ approvedAt: at(1) });
          const visible = await f.material();
          await db.contentSource.update({ where: { id: f.source.id }, data: { enabled: false } });
          assert.equal((await f.run()).notificationsCreated, 0);
          await db.contentSource.update({ where: { id: f.source.id }, data: { enabled: true } });
          await db.contentModuleSettings.update({
            where: { id: 'content' },
            data: { enabled: false },
          });
          assert.equal((await f.run(at(1))).status, 'disabled');
          const schedule = await db.savedOpportunitySearch.findUniqueOrThrow({
            where: { id: f.search.id },
          });
          assert.equal(schedule.nextNotificationAt?.getTime(), at(1).getTime());
          await db.contentModuleSettings.update({
            where: { id: 'content' },
            data: { enabled: true },
          });
          const result = await f.run(at(1));
          assert.equal(result.matchesRecorded, 2);
          assert.ok(
            await db.opportunitySearchMatch.findUnique({
              where: { searchId_itemId: { searchId: f.search.id, itemId: visible.id } },
            }),
          );
        },
      );

      await t.test(
        'blocked recipients advance without delivery and cannot starve the next due search',
        async () => {
          const blocked = await fixture();
          const active = await fixture();
          await blocked.material();
          await active.material();
          await db.savedOpportunitySearch.update({
            where: { id: blocked.search.id },
            data: { nextNotificationAt: at(-0.5) },
          });
          await db.user.update({ where: { id: blocked.owner.id }, data: { status: 'suspended' } });
          const options = { now, batchSize: 1, searchIds: [blocked.search.id, active.search.id] };
          assert.equal(
            (await runOpportunitySearchNotifications(db, options)).notificationsCreated,
            0,
          );
          assert.equal(
            (await runOpportunitySearchNotifications(db, options)).notificationsCreated,
            1,
          );
          assert.deepEqual(await blocked.notices(), []);
          assert.equal(
            await db.opportunitySearchMatch.count({ where: { searchId: blocked.search.id } }),
            0,
          );
        },
      );

      await t.test(
        'concurrent passes and restart retain one digest and one match identity across re-publication',
        async () => {
          const f = await fixture();
          const material = await f.material();
          const concurrent = await Promise.all([f.run(), f.run()]);
          assert.equal(
            concurrent.reduce((n, result) => n + result.notificationsCreated, 0),
            1,
          );
          assert.equal((await f.notices()).length, 1);
          assert.equal((await f.run()).notificationsCreated, 0);
          await db.contentItem.update({
            where: { id: material.id },
            data: { approvedAt: at(0.5) },
          });
          assert.equal((await f.run(at(1))).notificationsCreated, 0);
          assert.equal(
            await db.opportunitySearchMatch.count({ where: { searchId: f.search.id } }),
            1,
          );
          const [notice] = await f.notices();
          await db.notification.update({ where: { id: notice.id }, data: { readAt: now } });
          assert.equal((await f.run(at(2))).notificationsCreated, 0);
          assert.equal((await f.notices())[0].readAt?.getTime(), now.getTime());
        },
      );

      await t.test(
        'daily/weekly schedules are elapsed periods and delayed workers do not send catch-up bursts',
        async () => {
          const f = await fixture('weekly');
          await f.material();
          assert.equal((await f.run(at(3))).notificationsCreated, 1);
          const search = await db.savedOpportunitySearch.findUniqueOrThrow({
            where: { id: f.search.id },
          });
          assert.equal(search.nextNotificationAt?.getTime(), at(10).getTime());
          await f.material({ approvedAt: at(4) });
          assert.equal((await f.run(at(9))).scannedSearches, 0);
          assert.equal((await f.run(at(10))).notificationsCreated, 1);
        },
      );

      await t.test(
        'one digest records at most fifty matches and leaves the remainder for the next period',
        async () => {
          const f = await fixture();
          for (let i = 0; i < 52; i++) await f.material();
          assert.equal((await f.run()).matchesRecorded, 50);
          assert.equal((await f.run()).matchesRecorded, 0);
          assert.equal((await f.run(at(1))).matchesRecorded, 2);
          assert.equal(
            await db.opportunitySearchMatch.count({ where: { searchId: f.search.id } }),
            52,
          );
          assert.deepEqual((await f.notices()).map((n) => n.text.match(/: (\d+)\./)?.[1]).sort(), [
            '2',
            '50',
          ]);
        },
      );

      await t.test(
        'failure after inbox insertion rolls back delivery, match ledger and schedule together',
        async () => {
          const f = await fixture();
          await f.material();
          const failingDatabase = {
            $transaction: (callback: (tx: unknown) => unknown, options: unknown) =>
              db.$transaction(
                (tx) =>
                  callback(
                    new Proxy(tx, {
                      get(target, property, receiver) {
                        if (property === 'opportunitySearchMatch')
                          return {
                            createMany: () => {
                              throw Error('Synthetic ledger write failure');
                            },
                          };
                        return Reflect.get(target, property, receiver);
                      },
                    }),
                  ),
                options as never,
              ),
          } as unknown as PrismaClient;
          await assert.rejects(
            runOpportunitySearchNotifications(failingDatabase, { now, searchIds: [f.search.id] }),
            /Synthetic ledger write failure/,
          );
          assert.deepEqual(await f.notices(), []);
          assert.equal(
            await db.opportunitySearchMatch.count({ where: { searchId: f.search.id } }),
            0,
          );
          assert.equal(
            (
              await db.savedOpportunitySearch.findUniqueOrThrow({ where: { id: f.search.id } })
            ).nextNotificationAt?.getTime(),
            now.getTime(),
          );
          assert.equal((await f.run()).notificationsCreated, 1);
        },
      );

      await t.test(
        'off and removed searches cannot deliver; deleting a search clears its match ledger',
        async () => {
          const f = await fixture();
          await f.material();
          assert.equal((await f.run()).notificationsCreated, 1);
          await mutateOpportunitySaves(db, f.owner, {
            action: 'setSearchNotifications',
            searchId: f.search.id,
            frequency: 'off',
          });
          await f.material({ approvedAt: at(1) });
          assert.equal((await f.run(at(2))).scannedSearches, 0);
          await mutateOpportunitySaves(db, f.owner, {
            action: 'removeSearch',
            searchId: f.search.id,
          });
          assert.equal(
            await db.opportunitySearchMatch.count({ where: { searchId: f.search.id } }),
            0,
          );
          assert.equal((await f.run(at(3))).scannedSearches, 0);
          assert.equal((await f.notices()).length, 1);
        },
      );

      await t.test(
        'frequency preferences are owner-only, retry-safe and keep their baseline on active cadence changes',
        async () => {
          const f = await fixture('off');
          const other = await db.user.create({
            data: {
              id: randomUUID(),
              email: randomUUID() + '@example.test',
              name: 'Synthetic other owner',
              roles: [],
            },
          });
          await assert.rejects(
            mutateOpportunitySaves(db, other, {
              action: 'setSearchNotifications',
              searchId: f.search.id,
              frequency: 'daily',
            }),
            (error: unknown) => error instanceof AppError && error.status === 404,
          );
          await mutateOpportunitySaves(db, f.owner, {
            action: 'setSearchNotifications',
            searchId: f.search.id,
            frequency: 'daily',
          });
          const initial = await db.savedOpportunitySearch.findUniqueOrThrow({
            where: { id: f.search.id },
          });
          assert.equal(
            initial.nextNotificationAt!.getTime() - initial.notificationSince!.getTime(),
            DAY,
          );
          await mutateOpportunitySaves(db, f.owner, {
            action: 'setSearchNotifications',
            searchId: f.search.id,
            frequency: 'daily',
          });
          const repeated = await db.savedOpportunitySearch.findUniqueOrThrow({
            where: { id: f.search.id },
          });
          assert.equal(repeated.notificationSince?.getTime(), initial.notificationSince?.getTime());
          assert.equal(
            repeated.nextNotificationAt?.getTime(),
            initial.nextNotificationAt?.getTime(),
          );
          const [beforeChange] = await db.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`;
          await mutateOpportunitySaves(db, f.owner, {
            action: 'setSearchNotifications',
            searchId: f.search.id,
            frequency: 'weekly',
          });
          const weekly = await db.savedOpportunitySearch.findUniqueOrThrow({
            where: { id: f.search.id },
          });
          const [afterChange] = await db.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`;
          assert.equal(weekly.notificationSince?.getTime(), initial.notificationSince?.getTime());
          assert.ok(weekly.nextNotificationAt!.getTime() >= beforeChange.now.getTime() + 7 * DAY);
          assert.ok(weekly.nextNotificationAt!.getTime() <= afterChange.now.getTime() + 7 * DAY);
        },
      );

      await t.test(
        're-enabling excludes off-period materials and retains previously delivered identities',
        async () => {
          const f = await fixture();
          await f.material();
          assert.equal((await f.run()).matchesRecorded, 1);
          await mutateOpportunitySaves(db, f.owner, {
            action: 'setSearchNotifications',
            searchId: f.search.id,
            frequency: 'off',
          });
          await f.material({ approvedAt: at(-0.5) });
          const [beforeEnable] = await db.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`;
          await mutateOpportunitySaves(db, f.owner, {
            action: 'setSearchNotifications',
            searchId: f.search.id,
            frequency: 'daily',
          });
          const enabled = await db.savedOpportunitySearch.findUniqueOrThrow({
            where: { id: f.search.id },
          });
          assert.ok(enabled.notificationSince!.getTime() >= beforeEnable.now.getTime());
          assert.equal((await f.run(enabled.nextNotificationAt!)).matchesRecorded, 0);
          assert.equal(
            await db.opportunitySearchMatch.count({ where: { searchId: f.search.id } }),
            1,
          );
          assert.equal((await f.notices()).length, 1);
        },
      );

      await t.test(
        'invalid internal scope/clock/batch options fail before database changes',
        async () => {
          for (const options of [
            { batchSize: 0 },
            { batchSize: 21 },
            { batchSize: 1.5 },
            { now: new Date('invalid') },
            { searchIds: [''] },
          ])
            await assert.rejects(runOpportunitySearchNotifications(db, options), RangeError);
        },
      );
    } finally {
      await db.contentSource.updateMany({
        where: { id: { in: sourceIds } },
        data: { enabled: false },
      });
      await db.contentModuleSettings.update({
        where: { id: 'content' },
        data: { enabled: original.enabled },
      });
    }
  },
);
