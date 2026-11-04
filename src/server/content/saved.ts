import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { assert } from '@/lib/permissions';
import { config } from '@/lib/config';
import {
  normalizeOpportunityFilters,
  opportunitySavedCommand,
  opportunitySearchKey,
  opportunityNotificationDelay,
} from '@/lib/opportunity-saved';
import { projectPublicContent, publicContentSelect, visibleContentWhere } from './public';

type Tx = Prisma.TransactionClient;
async function requireActiveAccount(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  assert(
    user?.status === 'active' && (!user.demo || config.demoEnabled),
    403,
    'Аккаунт недоступен.',
  );
  return user;
}
/** Private lists contain unavailable placeholders, never unpublished/withdrawn revision data. */
export async function queryOpportunitySaves(database: PrismaClient, actor: User) {
  return database.$transaction(
    async (tx) => {
      await requireActiveAccount(tx, actor.id);
      const favorites = await tx.opportunityFavorite.findMany({
        where: { userId: actor.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: { id: true, itemId: true, createdAt: true },
      });
      const searches = await tx.savedOpportunitySearch.findMany({
        where: { userId: actor.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      });
      const settings = await tx.contentModuleSettings.findUnique({ where: { id: 'content' } });
      const items =
        settings?.enabled && favorites.length
          ? await tx.contentItem.findMany({
              where: { ...visibleContentWhere(), id: { in: favorites.map((f) => f.itemId) } },
              select: publicContentSelect,
            })
          : [];
      const posts = new Map(items.map((item) => [item.id, projectPublicContent(item)]));
      return {
        favorites: favorites.map((favorite) => ({
          ...favorite,
          post: posts.get(favorite.itemId) ?? null,
        })),
        searches: searches.map((search) => ({
          id: search.id,
          name: search.name,
          createdAt: search.createdAt,
          notificationFrequency: search.notificationFrequency,
          nextNotificationAt: search.nextNotificationAt,
          filters: {
            q: search.q,
            ...(search.category ? { category: search.category } : {}),
            geography: search.geography,
            ...(search.specialty ? { specialty: search.specialty } : {}),
          },
        })),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
/** Set/remove semantics, uniqueness and a user-row lock make retries and concurrent saves safe. */
export async function mutateOpportunitySaves(database: PrismaClient, actor: User, raw: unknown) {
  const input = opportunitySavedCommand.parse(raw);
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id} FOR UPDATE`;
    await requireActiveAccount(tx, actor.id);
    if (input.action === 'removeFavorite') {
      await tx.opportunityFavorite.deleteMany({
        where: { id: input.favoriteId, userId: actor.id },
      });
    } else if (input.action === 'removeSearch') {
      await tx.savedOpportunitySearch.deleteMany({
        where: { id: input.searchId, userId: actor.id },
      });
    } else if (input.action === 'setSearchNotifications') {
      const search = await tx.savedOpportunitySearch.findFirst({
        where: { id: input.searchId, userId: actor.id },
      });
      assert(search, 404, 'Сохранённый поиск недоступен.');
      // A retried preference must not postpone delivery or reset its baseline.
      if (search.notificationFrequency === input.frequency) return { saved: true as const };
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const enabled = input.frequency !== 'off';
      await tx.savedOpportunitySearch.update({
        where: { id: search.id },
        data: {
          notificationFrequency: input.frequency,
          notificationSince: enabled ? (search.notificationSince ?? clock.now) : null,
          nextNotificationAt: enabled
            ? new Date(
                clock.now.getTime() +
                  opportunityNotificationDelay[input.frequency as 'daily' | 'weekly'],
              )
            : null,
        },
      });
    } else if (input.action === 'saveFavorite') {
      const existing = await tx.opportunityFavorite.findUnique({
        where: { userId_itemId: { userId: actor.id, itemId: input.itemId } },
      });
      if (existing) return { saved: true as const };
      const settings = await tx.contentModuleSettings.findUnique({ where: { id: 'content' } });
      const visible =
        settings?.enabled &&
        (await tx.contentItem.findFirst({
          where: { ...visibleContentWhere(), id: input.itemId },
          select: publicContentSelect,
        }));
      assert(
        visible && projectPublicContent(visible),
        404,
        'Возможность недоступна. Обновите каталог.',
      );
      assert(
        (await tx.opportunityFavorite.count({ where: { userId: actor.id } })) < 100,
        409,
        'Можно сохранить до 100 возможностей. Удалите ненужное из избранного.',
      );
      await tx.opportunityFavorite.create({ data: { userId: actor.id, itemId: input.itemId } });
    } else {
      const filters = normalizeOpportunityFilters(input.filters);
      const queryHash = createHash('sha256').update(opportunitySearchKey(filters)).digest('hex');
      const existing = await tx.savedOpportunitySearch.findUnique({
        where: { userId_queryHash: { userId: actor.id, queryHash } },
      });
      if (existing) return { saved: true as const };
      assert(
        (await tx.savedOpportunitySearch.count({ where: { userId: actor.id } })) < 20,
        409,
        'Можно сохранить до 20 поисков. Удалите ненужный поиск.',
      );
      await tx.savedOpportunitySearch.create({
        data: {
          userId: actor.id,
          name: input.name,
          queryHash,
          q: filters.q,
          category: filters.category ?? null,
          geography: filters.geography,
          specialty: filters.specialty ?? null,
        },
      });
    }
    return { saved: true as const };
  });
}
