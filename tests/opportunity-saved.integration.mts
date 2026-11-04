import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { after, test } from 'node:test';
import { db } from '../src/lib/db';
import { AppError } from '../src/lib/permissions';
import { mutateContentIntake, queryContentDetail } from '../src/server/content/service';
import { mutateOpportunitySaves, queryOpportunitySaves } from '../src/server/content/saved';
import { opportunitySavedDataSchema } from '../src/contracts/opportunity-saved';

const target = new URL(process.env.DATABASE_URL || 'invalid:');
if (
  !/^\/student_marketplace_e2e(?:_content_[a-f0-9]{12})?$/.test(target.pathname) ||
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  process.env.DATABASE_TEST_URL !== process.env.DATABASE_URL
)
  throw Error('Isolated content test database required.');
after(() => db.$disconnect());
const status = (expected: number) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.status, expected);
  return true;
};

test('private opportunity favorites and saved searches', { concurrency: false }, async (t) => {
  const original = await db.contentModuleSettings.findUniqueOrThrow({ where: { id: 'content' } });
  const user = async (roles: string[] = []) =>
    db.user.create({
      data: {
        id: randomUUID(),
        email: randomUUID() + '@example.test',
        name: 'Saved opportunity fixture',
        emailVerified: true,
        roles,
      },
    });
  const admin = await user(['admin']);
  const owner = await user();
  const other = await user(['student']);
  await mutateContentIntake({ action: 'setModuleEnabled', enabled: true }, admin);
  const created = await mutateContentIntake(
    {
      action: 'createSource',
      name: 'Saved opportunity fixture source',
      type: 'manual',
      allowedHost: 'example.org',
      enabled: true,
      rightsNote: 'Synthetic fixture for private saved opportunity tests.',
    },
    admin,
  );
  assert.ok('sourceId' in created);
  const sourceId = created.sourceId;
  const makeMaterial = async (publish = true) => {
    const created = await mutateContentIntake(
      {
        action: 'addManualContent',
        sourceId,
        url: 'https://example.org/opportunity/' + randomUUID(),
        title: 'Public student grant ' + randomUUID(),
        summary: 'Public grant summary.',
        category: 'grant',
        geography: 'Астана',
        language: 'ru',
      },
      admin,
    );
    assert.ok('itemId' in created);
    if (publish) {
      const detail = await queryContentDetail(admin, created.itemId);
      await mutateContentIntake(
        {
          action: 'reviewContent',
          itemId: created.itemId,
          expectedRevisionId: detail.item.revisions[0].id,
          expectedUpdatedAt: detail.item.updatedAt.toISOString(),
          decision: 'publish',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          reason: 'Synthetic explicit publication for saved opportunity fixture.',
        },
        admin,
      );
    }
    return created.itemId;
  };
  try {
    const itemId = await makeMaterial();
    await t.test(
      'account without onboarding roles can save concurrently without duplicates',
      async () => {
        const first = await Promise.all([
          mutateOpportunitySaves(db, owner, { action: 'saveFavorite', itemId }),
          mutateOpportunitySaves(db, owner, { action: 'saveFavorite', itemId }),
        ]);
        assert.deepEqual(first, [{ saved: true }, { saved: true }]);
        const data = await queryOpportunitySaves(db, owner);
        opportunitySavedDataSchema.parse(JSON.parse(JSON.stringify(data)));
        assert.equal(data.favorites.length, 1);
        assert.equal(data.favorites[0].post?.id, itemId);
        assert.equal(
          await db.opportunityFavorite.count({ where: { userId: owner.id, itemId } }),
          1,
        );
        assert.equal((await queryOpportunitySaves(db, other)).favorites.length, 0);
      },
    );
    await t.test('another account cannot remove favorite or search identifiers', async () => {
      await mutateOpportunitySaves(db, owner, {
        action: 'saveSearch',
        name: 'Medical grant',
        filters: { q: 'ГРАНТ', specialty: 'health' },
      });
      const saved = await queryOpportunitySaves(db, owner);
      await mutateOpportunitySaves(db, other, {
        action: 'removeFavorite',
        favoriteId: saved.favorites[0].id,
      });
      await mutateOpportunitySaves(db, other, {
        action: 'removeSearch',
        searchId: saved.searches[0].id,
      });
      assert.equal((await queryOpportunitySaves(db, owner)).favorites.length, 1);
      assert.equal((await queryOpportunitySaves(db, owner)).searches.length, 1);
      assert.deepEqual((await queryOpportunitySaves(db, other)).searches, []);
    });
    await t.test(
      'canonical saved queries deduplicate and keep the original identity/name',
      async () => {
        const fields = {
          action: 'saveSearch',
          name: 'Әлем гранттары',
          filters: { q: '  ГРАНТ\t ӘЛЕМ ', geography: '  ҚАЗАҚСТАН ', category: 'grant' },
        };
        await Promise.all([
          mutateOpportunitySaves(db, owner, fields),
          mutateOpportunitySaves(db, owner, {
            action: 'saveSearch',
            name: 'Same query repeat',
            filters: { category: 'grant', geography: 'қазақстан', q: 'грант әлем' },
          }),
        ]);
        const results = (await queryOpportunitySaves(db, owner)).searches.filter(
          (search) => search.filters.q === 'грант әлем',
        );
        assert.equal(results.length, 1);
        assert.equal(results[0].filters.geography, 'қазақстан');
        const identity = results[0].id;
        await mutateOpportunitySaves(db, owner, {
          action: 'saveSearch',
          name: 'Retry',
          filters: results[0].filters,
        });
        assert.equal(
          (await queryOpportunitySaves(db, owner)).searches.find((search) => search.id === identity)
            ?.name,
          results[0].name,
        );
      },
    );
    await t.test(
      'never saves an unpublished target and strictly rejects owner/pagination input',
      async () => {
        const unpublished = await makeMaterial(false);
        await assert.rejects(
          mutateOpportunitySaves(db, owner, { action: 'saveFavorite', itemId: unpublished }),
          status(404),
        );
        for (const filters of [{ q: '', page: 2 }, { q: '', limit: 6 }, { userId: other.id }])
          await assert.rejects(
            mutateOpportunitySaves(db, owner, {
              action: 'saveSearch',
              name: 'Invalid input',
              filters,
            }),
          );
        await assert.rejects(
          mutateOpportunitySaves(db, owner, { action: 'saveFavorite', itemId, userId: other.id }),
        );
      },
    );
    await t.test('pending editorial versions never leak through saved favorites', async () => {
      const current = await queryContentDetail(admin, itemId);
      await mutateContentIntake(
        {
          action: 'editContent',
          itemId,
          expectedRevisionId: current.item.revisions[0].id,
          expectedUpdatedAt: current.item.updatedAt.toISOString(),
          url: current.item.canonicalUrl,
          title: 'PRIVATE_DRAFT_DO_NOT_LEAK',
          summary: 'PRIVATE_DRAFT_SUMMARY',
          category: 'grant',
          language: 'ru',
          reason: 'Synthetic private editorial change before another approval.',
        },
        admin,
      );
      const data = await queryOpportunitySaves(db, owner);
      assert.equal(data.favorites[0].post, null);
      assert.ok(!JSON.stringify(data).includes('PRIVATE_DRAFT'));
      const detail = await queryContentDetail(admin, itemId);
      await mutateContentIntake(
        {
          action: 'reviewContent',
          itemId,
          expectedRevisionId: detail.item.revisions[0].id,
          expectedUpdatedAt: detail.item.updatedAt.toISOString(),
          decision: 'publish',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          reason: 'Synthetic approval to restore the saved content reference.',
        },
        admin,
      );
      assert.equal(
        (await queryOpportunitySaves(db, owner)).favorites[0].post?.title,
        'PRIVATE_DRAFT_DO_NOT_LEAK',
      );
    });
    await t.test(
      'source/module switches, expiry and withdrawal produce removable placeholders',
      async () => {
        await mutateContentIntake({ action: 'setSourceEnabled', sourceId, enabled: false }, admin);
        assert.equal((await queryOpportunitySaves(db, owner)).favorites[0].post, null);
        await mutateContentIntake({ action: 'setSourceEnabled', sourceId, enabled: true }, admin);
        await mutateContentIntake({ action: 'setModuleEnabled', enabled: false }, admin);
        assert.equal((await queryOpportunitySaves(db, owner)).favorites[0].post, null);
        await mutateContentIntake({ action: 'setModuleEnabled', enabled: true }, admin);
        await db.contentItem.update({
          where: { id: itemId },
          data: {
            approvedAt: new Date(Date.now() - 7200000),
            expiresAt: new Date(Date.now() - 1000),
          },
        });
        assert.equal((await queryOpportunitySaves(db, owner)).favorites[0].post, null);
        await db.contentItem.update({
          where: { id: itemId },
          data: { expiresAt: new Date(Date.now() + 86400000) },
        });
        const detail = await queryContentDetail(admin, itemId);
        await mutateContentIntake(
          {
            action: 'reviewContent',
            itemId,
            expectedRevisionId: detail.item.revisions[0].id,
            expectedUpdatedAt: detail.item.updatedAt.toISOString(),
            decision: 'withdraw',
            reason: 'Synthetic withdrawal preserves saved identity without exposure.',
          },
          admin,
        );
        const saved = await queryOpportunitySaves(db, owner);
        assert.equal(saved.favorites[0].post, null);
        await mutateOpportunitySaves(db, owner, {
          action: 'removeFavorite',
          favoriteId: saved.favorites[0].id,
        });
        await mutateOpportunitySaves(db, owner, {
          action: 'removeFavorite',
          favoriteId: saved.favorites[0].id,
        });
        assert.deepEqual((await queryOpportunitySaves(db, owner)).favorites, []);
      },
    );
    await t.test(
      'blocked/deleted actors are checked in the database for reads and writes',
      async () => {
        const blocked = await user();
        await db.user.update({ where: { id: blocked.id }, data: { status: 'suspended' } });
        await assert.rejects(queryOpportunitySaves(db, blocked), status(403));
        await assert.rejects(
          mutateOpportunitySaves(db, blocked, {
            action: 'saveSearch',
            name: 'Blocked',
            filters: {},
          }),
          status(403),
        );
        const deleted = await user();
        await db.user.delete({ where: { id: deleted.id } });
        await assert.rejects(queryOpportunitySaves(db, deleted), status(403));
        await assert.rejects(
          mutateOpportunitySaves(db, deleted, { action: 'removeSearch', searchId: 'missing' }),
          status(403),
        );
      },
    );
    await t.test('concurrent distinct searches cannot exceed the per-user cap', async () => {
      const capped = await user();
      for (let index = 0; index < 19; index++)
        await mutateOpportunitySaves(db, capped, {
          action: 'saveSearch',
          name: 'Search ' + index,
          filters: { q: 'query ' + index },
        });
      const attempts = await Promise.allSettled([
        mutateOpportunitySaves(db, capped, {
          action: 'saveSearch',
          name: 'Last slot A',
          filters: { q: 'last slot a' },
        }),
        mutateOpportunitySaves(db, capped, {
          action: 'saveSearch',
          name: 'Last slot B',
          filters: { q: 'last slot b' },
        }),
      ]);
      assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(
        attempts.filter(
          (result) =>
            result.status === 'rejected' &&
            result.reason instanceof AppError &&
            result.reason.status === 409,
        ).length,
        1,
      );
      const saved = await queryOpportunitySaves(db, capped);
      assert.equal(saved.searches.length, 20);
      await mutateOpportunitySaves(db, capped, {
        action: 'saveSearch',
        name: 'Retry at cap',
        filters: saved.searches[0].filters,
      });
      assert.equal((await queryOpportunitySaves(db, capped)).searches.length, 20);
      await mutateOpportunitySaves(db, capped, {
        action: 'removeSearch',
        searchId: saved.searches[0].id,
      });
      await mutateOpportunitySaves(db, capped, {
        action: 'removeSearch',
        searchId: saved.searches[0].id,
      });
      assert.equal((await queryOpportunitySaves(db, capped)).searches.length, 19);
    });
    await t.test(
      'favorite cap counts unavailable references and retry remains idempotent',
      async () => {
        const capped = await user();
        const fixtureIds = Array.from({ length: 100 }, () => randomUUID());
        await db.contentItem.createMany({
          data: fixtureIds.map((id) => ({
            id,
            sourceId,
            canonicalUrl: 'https://example.org/cap/' + id,
            urlHash: createHash('sha256').update(id).digest('hex'),
          })),
        });
        await db.opportunityFavorite.createMany({
          data: fixtureIds.map((itemId) => ({ userId: capped.id, itemId })),
        });
        const visibleId = await makeMaterial();
        await assert.rejects(
          mutateOpportunitySaves(db, capped, { action: 'saveFavorite', itemId: visibleId }),
          status(409),
        );
        await mutateOpportunitySaves(db, capped, { action: 'saveFavorite', itemId: fixtureIds[0] });
        const saved = await queryOpportunitySaves(db, capped);
        assert.equal(saved.favorites.length, 100);
        assert.ok(saved.favorites.every((favorite) => favorite.post === null));
      },
    );
  } finally {
    await db.contentSource.update({ where: { id: sourceId }, data: { enabled: false } });
    await db.contentModuleSettings.update({
      where: { id: 'content' },
      data: { enabled: original.enabled },
    });
  }
});
