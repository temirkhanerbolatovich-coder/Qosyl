import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { OpportunityQuery } from '@/lib/content-validation';
import { searchContentQueue } from './search';

// The same projection is used by the catalogue and private favorites. Never read the latest draft.
export const publicContentSelect = {
  id: true,
  approvedAt: true,
  expiresAt: true,
  source: { select: { name: true } },
  approvedRevision: {
    select: {
      title: true,
      summary: true,
      category: true,
      geography: true,
      language: true,
      canonicalUrl: true,
      publishedAt: true,
      deadline: true,
      eventDate: true,
    },
  },
} satisfies Prisma.ContentItemSelect;
export function visibleContentWhere(): Prisma.ContentItemWhereInput {
  return {
    status: 'published',
    expiresAt: { gt: new Date() },
    source: { enabled: true },
    approvedRevisionId: { not: null },
  };
}
export function projectPublicContent(
  item: Prisma.ContentItemGetPayload<{ select: typeof publicContentSelect }>,
) {
  const revision = item.approvedRevision;
  if (!revision?.canonicalUrl || !item.approvedAt || !item.expiresAt) return null;
  return {
    id: item.id,
    title: revision.title,
    summary: revision.summary,
    category: revision.category,
    geography: revision.geography,
    language: revision.language,
    url: revision.canonicalUrl,
    sourceName: item.source.name,
    publishedAt: revision.publishedAt,
    approvedAt: item.approvedAt,
    expiresAt: item.expiresAt,
    deadline: revision.deadline,
    eventDate: revision.eventDate,
  };
}

/** Public projection reads only the explicitly approved immutable snapshot. No remote I/O. */
export async function queryPublicContent(limit = 6, query?: OpportunityQuery) {
  return db.$transaction(
    async (tx) => {
      const settings = await tx.contentModuleSettings.findUnique({ where: { id: 'content' } });
      if (!settings?.enabled) return { posts: [] };
      const matched = query ? await searchContentQueue(query, undefined, true, limit, tx) : null;
      const items = await tx.contentItem.findMany({
        where: { ...visibleContentWhere(), ...(matched ? { id: { in: matched.ids } } : {}) },
        orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: publicContentSelect,
      });
      return {
        posts: items.flatMap((item) => {
          const post = projectPublicContent(item);
          return post ? [post] : [];
        }),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
