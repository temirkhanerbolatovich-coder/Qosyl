import { searchContentQueue } from './search';
import type { OpportunityQuery } from '@/lib/content-validation';
import 'server-only';
import { Prisma, type User } from '@prisma/client';
import { db } from '@/lib/db';
import { assert, requireRole } from '@/lib/permissions';
import { AppError } from '@/lib/permissions';
import { config } from '@/lib/config';
import {
  sourceInput,
  manualContentInput,
  contentSettingsInput,
  requestSyncInput,
  contentReviewInput,
  contentEditInput,
  contentStatuses,
} from '@/lib/content-validation';
import {
  ContentFeedError,
  normalizeContentItem,
  type NormalizedContentItem,
} from '@/lib/content-feed';

type Tx = Prisma.TransactionClient;

/** Identity and content revision are separate: a repeated revision does not create another item. */
export async function storeContentItem(
  tx: Tx,
  sourceId: string,
  item: NormalizedContentItem,
  origin: 'manual' | 'import' = 'import',
) {
  const matches = await tx.contentItem.findMany({
    where: {
      sourceId,
      OR: [
        { urlHash: item.urlHash },
        ...(item.externalId ? [{ externalId: item.externalId }] : []),
      ],
    },
    include: { revisions: { orderBy: { number: 'desc' }, take: 1 } },
  });
  assert(
    matches.length <= 1,
    409,
    'Идентификатор и ссылка относятся к разным материалам источника.',
  );
  const existing = matches[0];
  if (existing && ['withdrawn', 'archived', 'rejected'].includes(existing.status))
    return { kind: 'duplicate' as const, itemId: existing.id };
  // Returning to older text is a new observed revision; only the current snapshot is a duplicate.
  if (existing?.revisions[0]?.contentHash === item.contentHash) {
    return { kind: 'duplicate' as const, itemId: existing.id };
  }
  // An unchanged upstream snapshot must not undo an editor's approved wording.
  // Only a change relative to the last observed upstream snapshot reopens review.
  if (existing?.revisions[0]?.origin === 'editorial') {
    const upstream = await tx.contentRevision.findFirst({
      where: { itemId: existing.id, origin: { not: 'editorial' } },
      orderBy: { number: 'desc' },
    });
    if (upstream?.contentHash === item.contentHash)
      return { kind: 'duplicate' as const, itemId: existing.id };
  }
  const saved = existing
    ? await tx.contentItem.update({
        where: { id: existing.id },
        data: {
          canonicalUrl: item.canonicalUrl,
          urlHash: item.urlHash,
          externalId: existing.externalId ?? item.externalId,
          status: 'pending_review',
        },
      })
    : await tx.contentItem.create({
        data: {
          sourceId,
          externalId: item.externalId,
          canonicalUrl: item.canonicalUrl,
          urlHash: item.urlHash,
        },
      });
  await tx.contentRevision.create({
    data: {
      itemId: saved.id,
      canonicalUrl: item.canonicalUrl,
      origin,
      number: (existing?.revisions[0]?.number ?? 0) + 1,
      title: item.title,
      summary: item.summary,
      category: item.category,
      geography: item.geography,
      language: item.language,
      publishedAt: item.publishedAt,
      publishedAtRaw: item.publishedAtRaw,
      deadline: item.deadline,
      eventDate: item.eventDate,
      score: item.score,
      contentHash: item.contentHash,
    },
  });
  return { kind: existing ? ('updated' as const) : ('created' as const), itemId: saved.id };
}

export async function queryContentIntake(
  user: User,
  page = 1,
  status?: (typeof contentStatuses)[number],
  filters?: OpportunityQuery,
) {
  requireRole(user.roles, 'admin');
  assert(Number.isInteger(page) && page >= 1 && page <= 10000, 400, 'Некорректная страница.');
  const matched = filters ? await searchContentQueue({ ...filters, page }, status) : null;
  const where = matched ? { id: { in: matched.ids } } : status ? { status } : {};
  const [settings, sources, items, total, runs] = await Promise.all([
    db.contentModuleSettings.findUniqueOrThrow({ where: { id: 'content' } }),
    db.contentSource.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 }),
    db.contentItem.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 20,
      skip: matched ? 0 : (page - 1) * 20,
      include: { revisions: { orderBy: { number: 'desc' }, take: 1 } },
    }),
    matched ? Promise.resolve(matched.total) : db.contentItem.count({ where }),
    db.crawlRun.findMany({ orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take: 30 }),
  ]);
  return { settings, sources, items, runs, page, total };
}

export async function queryContentDetail(user: User, itemId: string, historyPage = 1) {
  requireRole(user.roles, 'admin');
  assert(
    Number.isInteger(historyPage) && historyPage >= 1 && historyPage <= 10000,
    400,
    'Некорректная страница истории.',
  );
  const item = await db.contentItem.findUnique({
    where: { id: itemId },
    include: { revisions: { orderBy: { number: 'desc' }, take: 1 }, source: true },
  });
  assert(item, 404, 'Материал не найден.');
  const [history, historyTotal, audits] = await Promise.all([
    db.contentRevision.findMany({
      where: { itemId },
      orderBy: { number: 'desc' },
      skip: (historyPage - 1) * 20,
      take: 20,
    }),
    db.contentRevision.count({ where: { itemId } }),
    db.contentAudit.findMany({
      where: { itemId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    }),
  ]);
  const { source, ...record } = item;
  return { item: record, source, history, historyPage, historyTotal, audits };
}

async function applyEditorialAction(
  tx: Tx,
  raw: Record<string, unknown>,
  actorId: string,
  moduleEnabled: boolean,
) {
  const editing = raw.action === 'editContent';
  const input = editing ? contentEditInput.parse(raw) : contentReviewInput.parse(raw);
  const item = await tx.contentItem.findUnique({
    where: { id: input.itemId },
    include: { revisions: { orderBy: { number: 'desc' }, take: 1 }, source: true },
  });
  assert(item, 404, 'Материал не найден.');
  const latest = item.revisions[0];
  assert(
    latest &&
      latest.id === input.expectedRevisionId &&
      item.updatedAt.toISOString() === input.expectedUpdatedAt,
    409,
    'Материал изменился. Обновите и проверьте текущую редакцию.',
  );
  if (editing) {
    const fields = contentEditInput.parse(raw);
    assert(
      !['withdrawn', 'archived', 'rejected'].includes(item.status),
      409,
      'Сначала верните материал на проверку.',
    );
    let normalized: NormalizedContentItem;
    try {
      normalized = normalizeContentItem(
        fields,
        `https://${item.source.allowedHost}/`,
        item.source.allowedHost,
      );
    } catch (error) {
      if (error instanceof ContentFeedError) throw new AppError(400, 'Некорректные поля редакции.');
      throw error;
    }
    const {
      canonicalUrl,
      urlHash,
      title,
      summary,
      category,
      geography,
      language,
      publishedAt,
      publishedAtRaw,
      deadline,
      eventDate,
      score,
      contentHash,
    } = normalized;
    const revision = await tx.contentRevision.create({
      data: {
        itemId: item.id,
        number: latest.number + 1,
        canonicalUrl,
        origin: 'editorial',
        title,
        summary,
        category,
        geography,
        language,
        publishedAt,
        publishedAtRaw,
        deadline,
        eventDate,
        score,
        contentHash,
      },
    });
    await tx.contentItem.update({
      where: { id: item.id },
      data: { canonicalUrl, urlHash, status: 'pending_review' },
    });
    await tx.contentAudit.create({
      data: {
        actorId,
        sourceId: item.sourceId,
        itemId: item.id,
        revisionId: revision.id,
        action: 'content_edited',
        reason: input.reason,
      },
    });
    return { saved: true };
  }
  const review = contentReviewInput.parse(raw);
  let status: string;
  let publication: Pick<
    Prisma.ContentItemUncheckedUpdateInput,
    'approvedRevisionId' | 'approvedAt' | 'expiresAt'
  > = {};
  if (review.decision === 'publish') {
    assert(
      moduleEnabled && item.source.enabled,
      409,
      'Включите модуль и источник перед публикацией.',
    );
    assert(item.status === 'pending_review', 409, 'Публиковать можно только материал на проверке.');
    assert(
      latest.canonicalUrl,
      409,
      'Сохраните новую редакцию со ссылкой перед публикацией исторического материала.',
    );
    const now = new Date(),
      expiresAt = new Date(review.expiresAt!);
    for (const end of [latest.deadline, latest.eventDate])
      if (end && end < expiresAt) expiresAt.setTime(end.getTime());
    assert(
      expiresAt > now && expiresAt.getTime() <= now.getTime() + 90 * 86400000,
      400,
      'Срок актуальности должен быть в будущем, не более 90 дней; учитываются срок подачи и дата события.',
    );
    status = 'published';
    publication = { approvedRevisionId: latest.id, approvedAt: now, expiresAt };
  } else if (review.decision === 'reopen') {
    assert(
      ['rejected', 'archived', 'withdrawn'].includes(item.status),
      409,
      'Материал уже находится в работе.',
    );
    status = 'pending_review';
  } else {
    status = { reject: 'rejected', archive: 'archived', withdraw: 'withdrawn' }[review.decision];
    assert(item.status !== status, 409, 'Это решение уже принято.');
  }
  await tx.contentItem.update({ where: { id: item.id }, data: { status, ...publication } });
  const action = {
    publish: 'content_published',
    reject: 'content_rejected',
    archive: 'content_archived',
    withdraw: 'content_withdrawn',
    reopen: 'content_reopened',
  }[review.decision];
  await tx.contentAudit.create({
    data: {
      actorId,
      sourceId: item.sourceId,
      itemId: item.id,
      revisionId: latest.id,
      action,
      reason: review.reason,
    },
  });
  return { saved: true };
}

/** Every mutation rechecks current admin state; GET never synchronizes a remote source. */
export async function mutateContentIntake(raw: Record<string, unknown>, sessionUser: User) {
  requireRole(sessionUser.roles, 'admin');
  return db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: sessionUser.id } });
      assert(user?.status === 'active', 403, 'Аккаунт недоступен.');
      requireRole(user.roles, 'admin');
      assert(config.localMode || user.emailVerified, 403, 'Сначала подтвердите email.');
      await tx.$queryRaw`SELECT "id" FROM "ContentModuleSettings" WHERE "id" = 'content' FOR UPDATE`;
      const settings = await tx.contentModuleSettings.findUniqueOrThrow({
        where: { id: 'content' },
      });
      if (raw.action === 'setModuleEnabled') {
        const { enabled } = contentSettingsInput.parse(raw);
        await tx.contentModuleSettings.update({ where: { id: 'content' }, data: { enabled } });
        await tx.contentAudit.create({
          data: {
            actorId: user.id,
            action: enabled ? 'module_enabled' : 'module_disabled',
            reason: 'Изменён флаг внутреннего сбора.',
          },
        });
        return { saved: true };
      }
      if (raw.action === 'createSource') {
        const input = sourceInput.parse(raw);
        assert(
          (await tx.contentSource.count()) < 100,
          409,
          'Достигнут лимит 100 источников пилота.',
        );
        const source = await tx.contentSource.create({
          data: { ...input, feedUrl: input.feedUrl ?? null, termsUrl: input.termsUrl ?? null },
        });
        await tx.contentAudit.create({
          data: {
            actorId: user.id,
            sourceId: source.id,
            action: 'source_created',
            reason: 'Добавлен источник с описанием условий использования.',
          },
        });
        return { sourceId: source.id };
      }
      if (raw.action === 'setSourceEnabled') {
        const { sourceId } = requestSyncInput.parse(raw);
        const { enabled } = contentSettingsInput.parse(raw);
        const source = await tx.contentSource.findUnique({ where: { id: sourceId } });
        assert(source, 404, 'Источник не найден.');
        await tx.contentSource.update({
          where: { id: sourceId },
          data: { enabled, ...(enabled && !source.enabled ? { consecutiveErrors: 0 } : {}) },
        });
        await tx.contentAudit.create({
          data: {
            actorId: user.id,
            sourceId,
            action: enabled ? 'source_enabled' : 'source_disabled',
            reason: 'Изменена активность источника.',
          },
        });
        return { saved: true };
      }
      if (raw.action === 'reviewContent' || raw.action === 'editContent')
        return applyEditorialAction(tx, raw, user.id, settings.enabled);
      assert(settings.enabled, 409, 'Внутренний сбор выключен.');
      if (raw.action === 'requestSync') {
        const { sourceId } = requestSyncInput.parse(raw);
        const source = await tx.contentSource.findUnique({ where: { id: sourceId } });
        assert(
          source?.enabled && ['rss', 'html'].includes(source.type),
          409,
          'Нужен включённый RSS или HTML источник.',
        );
        const active = await tx.crawlRun.findFirst({
          where: { sourceId, status: { in: ['queued', 'running'] } },
        });
        if (active) return { runId: active.id, status: active.status };
        assert(
          !source.nextRunAt || source.nextRunAt <= new Date(),
          429,
          'Источник ожидает следующего разрешённого запроса.',
        );
        const run = await tx.crawlRun.create({
          data: { sourceId, requestedById: user.id, status: 'queued' },
        });
        return { runId: run.id, status: run.status };
      }
      if (raw.action === 'addManualContent') {
        const input = manualContentInput.parse(raw);
        const source = await tx.contentSource.findUnique({ where: { id: input.sourceId } });
        assert(
          source?.enabled && source.type === 'manual',
          409,
          'Нужен включённый ручной источник.',
        );
        let item: NormalizedContentItem;
        try {
          item = normalizeContentItem(input, `https://${source.allowedHost}/`, source.allowedHost);
        } catch (error) {
          if (error instanceof ContentFeedError)
            throw new AppError(400, 'Некорректные поля или ссылка материала.');
          throw error;
        }
        const stored = await storeContentItem(tx, source.id, item, 'manual');
        if (stored.kind !== 'duplicate')
          await tx.contentAudit.create({
            data: {
              actorId: user.id,
              sourceId: source.id,
              itemId: stored.itemId,
              action: 'manual_content_saved',
              reason: 'Материал сохранён в закрытую очередь.',
            },
          });
        return stored;
      }
      assert(false, 400, 'Неизвестное действие модуля контента.');
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
  );
}
