import 'server-only';
import type { PrismaClient, User } from '@prisma/client';
import { assert, requireRole } from '@/lib/permissions';
import { config } from '@/lib/config';
import { contentInspectionInput } from '@/lib/content-validation';
import { inspectOpportunityHtml, formatOpportunityInspection } from '@/lib/opportunity-detail';
import { fetchFeed, ContentFetchError } from './fetch-feed';
import { ContentFeedError } from '@/lib/content-feed';

/** Append evidence without modifying an editorial snapshot or approving content. */
export async function inspectContentPage(
  database: PrismaClient,
  actor: User,
  raw: Record<string, unknown>,
  fetcher = fetchFeed,
) {
  requireRole(actor.roles, 'admin');
  const input = contentInspectionInput.parse(raw);
  const claim = await database.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: actor.id } });
    assert(user?.status === 'active', 403, 'Аккаунт недоступен.');
    requireRole(user.roles, 'admin');
    assert(config.localMode || user.emailVerified, 403, 'Сначала подтвердите email.');
    // Same lock as editorial mutations; reserve before network I/O to bound concurrent requests.
    await tx.$queryRaw`SELECT "id" FROM "ContentModuleSettings" WHERE "id" = 'content' FOR UPDATE`;
    const settings = await tx.contentModuleSettings.findUniqueOrThrow({ where: { id: 'content' } });
    assert(settings.enabled, 409, 'Сбор материалов выключен.');
    const item = await tx.contentItem.findUnique({
      where: { id: input.itemId },
      include: { source: true, revisions: { orderBy: { number: 'desc' }, take: 1 } },
    });
    assert(item, 404, 'Материал не найден.');
    assert(item.source.enabled, 409, 'Источник выключен.');
    const revision = item.revisions[0];
    assert(
      revision?.id === input.expectedRevisionId &&
        item.updatedAt.toISOString() === input.expectedUpdatedAt,
      409,
      'Материал изменился. Откройте актуальную редакцию.',
    );
    const recent = await tx.contentAudit.count({
      where: {
        action: 'page_inspection_requested',
        createdAt: { gte: new Date(Date.now() - 60000) },
        OR: [{ itemId: item.id }, { actorId: actor.id }],
      },
    });
    assert(recent === 0, 429, 'Повторная проверка доступна через минуту.');
    await tx.contentAudit.create({
      data: {
        actorId: actor.id,
        itemId: item.id,
        sourceId: item.sourceId,
        revisionId: revision.id,
        action: 'page_inspection_requested',
        reason: `Запрошена проверка страницы редакции № ${revision.number}.`,
      },
    });
    return {
      itemId: item.id,
      sourceId: item.sourceId,
      revisionId: revision.id,
      number: revision.number,
      url: revision.canonicalUrl ?? item.canonicalUrl,
      host: item.source.allowedHost,
    };
  });
  let reason: string;
  let action = 'page_inspection_completed';
  try {
    const response = await fetcher(claim.url, claim.host, { format: 'html' });
    const evidence = inspectOpportunityHtml(response.body, claim.url, claim.host, new Date());
    reason = formatOpportunityInspection(evidence, claim.number);
  } catch (error) {
    if (!(error instanceof ContentFetchError || error instanceof ContentFeedError)) throw error;
    action = 'page_inspection_failed';
    reason = `Не удалось проверить редакцию № ${claim.number}: ${error.code}. Источник: ${claim.url.slice(0, 500)}. Полная ссылка — в исходной редакции. Предыдущие сведения не обновлены; повторите проверку позднее.`;
  }
  await database.contentAudit.create({
    data: {
      actorId: actor.id,
      itemId: claim.itemId,
      sourceId: claim.sourceId,
      revisionId: claim.revisionId,
      action,
      reason,
    },
  });
  return { saved: true as const };
}
