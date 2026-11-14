import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { OpportunityQuery } from '@/lib/content-validation';
import { opportunitySpecialties } from '@/lib/opportunity-search';
import { searchContentQueue, searchPublicFacets, searchSimilarCandidateIds } from './search';

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
      workMode: true,
      payStatus: true,
      kazakhstanEligible: true,
      workFormat: true,
      kazakhstanEligibility: true,
      workload: true,
      compensation: true,
      hoursPerWeekMax: true,
      noExperience: true,
      alsoWorkModes: true,
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
    workMode: revision.workMode,
    payStatus: revision.payStatus,
    kazakhstanEligible: revision.kazakhstanEligible,
    workFormat: revision.workFormat,
    kazakhstanEligibility: revision.kazakhstanEligibility,
    workload: revision.workload,
    compensation: revision.compensation,
    hoursPerWeekMax: revision.hoursPerWeekMax,
    noExperience: revision.noExperience,
    alsoWorkModes: revision.alsoWorkModes,
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

/** One repeatable-read snapshot; `disabled` is returned while the content module is off. */
function readPublicSnapshot<T>(disabled: T, read: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(
    async (tx) => {
      const settings = await tx.contentModuleSettings.findUnique({ where: { id: 'content' } });
      return settings?.enabled ? read(tx) : disabled;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

/** Public projection reads only the explicitly approved immutable snapshot. No remote I/O. */
export async function queryPublicContent(
  limit = 6,
  query: OpportunityQuery = { limit, page: 1, q: '', geography: '' },
) {
  return readPublicSnapshot<{
    posts: NonNullable<ReturnType<typeof projectPublicContent>>[];
    total: number;
    facets?: Awaited<ReturnType<typeof searchPublicFacets>>;
  }>({ posts: [], total: 0 }, async (tx) => {
    const { ids, total } = await searchContentQueue(query, undefined, true, limit, tx);
    const facets = query.facets ? await searchPublicFacets(query, total, tx) : undefined;
    if (!ids.length) return { posts: [], total, ...(facets && { facets }) };
    // Visibility and order were selected in the same repeatable-read snapshot.
    const items = await tx.contentItem.findMany({
      where: { id: { in: ids } },
      select: publicContentSelect,
    });
    const itemsById = new Map(items.map((item) => [item.id, item]));
    return {
      total,
      ...(facets && { facets }),
      posts: ids.flatMap((id) => {
        const item = itemsById.get(id);
        const post = item && projectPublicContent(item);
        return post ? [post] : [];
      }),
    };
  });
}

export type SimilarOpportunity = {
  post: NonNullable<ReturnType<typeof projectPublicContent>>;
  /** Why it is shown: the same direction (by keywords) or only the same type. */
  reason: 'specialty' | 'category';
};

/**
 * Up to `limit` other current items of the same type, same-direction ones first, then newest.
 * Unclassified items have no meaningful neighbours, so they get none.
 */
export async function querySimilarOpportunities(id: string, limit = 3) {
  if (!id || id.length > 100) return [];
  return readPublicSnapshot<SimilarOpportunity[]>([], async (tx) => {
    const base = await tx.contentItem.findFirst({
      where: { ...visibleContentWhere(), id },
      select: publicContentSelect,
    });
    const basePost = base ? projectPublicContent(base) : null;
    if (!basePost || basePost.category === 'other') return [];
    const baseDirections = opportunitySpecialties(`${basePost.title} ${basePost.summary}`);
    const ids = await searchSimilarCandidateIds(basePost.category, id, 30, tx);
    if (!ids.length) return [];
    const items = await tx.contentItem.findMany({
      where: { id: { in: ids } },
      select: publicContentSelect,
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    const candidates = ids.flatMap((candidateId) => {
      const item = byId.get(candidateId);
      const post = item ? projectPublicContent(item) : null;
      if (!post) return [];
      const shared = opportunitySpecialties(`${post.title} ${post.summary}`).some((key) =>
        baseDirections.includes(key),
      );
      return [{ post, reason: shared ? ('specialty' as const) : ('category' as const) }];
    });
    // The sort is stable, so equal reasons keep the newest-first order of the query.
    return candidates
      .sort((a, b) => Number(b.reason === 'specialty') - Number(a.reason === 'specialty'))
      .slice(0, limit);
  });
}

/**
 * Look up one currently published revision. A row without an approval time or canonical URL is
 * projected to null, which matches the SQL conditions of the catalogue search.
 */
export async function queryPublicContentDetail(id: string) {
  if (!id || id.length > 100) return null;
  return readPublicSnapshot<ReturnType<typeof projectPublicContent>>(null, async (tx) => {
    const item = await tx.contentItem.findFirst({
      where: { ...visibleContentWhere(), id },
      select: publicContentSelect,
    });
    return item ? projectPublicContent(item) : null;
  });
}
