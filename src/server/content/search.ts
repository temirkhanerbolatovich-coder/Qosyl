import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { OpportunityQuery } from '@/lib/content-validation';
import { expandSearchTerms, specialtyTerms } from '@/lib/opportunity-search';

// Local PostgreSQL can use a C locale, whose lower() does not fold Cyrillic.
const upper = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯӘҒҚҢӨҰҮҺІ';
const lower = upper.toLowerCase();
const fold = (column: Prisma.Sql) => Prisma.sql`translate(lower(${column}), ${upper}, ${lower})`;
const containsAny = (column: Prisma.Sql, terms: string[]) =>
  Prisma.sql`(${Prisma.join(
    terms.map((term) => Prisma.sql`position(${term.toLowerCase()} in ${fold(column)}) > 0`),
    ' OR ',
  )})`;

/**
 * Shared predicates expect the immutable content revision to use SQL alias r.
 * Catalogue matching is opt-in: only the catalogue search expands synonyms and also matches the
 * extra formats of an opportunity, while saved-search notifications stay exact.
 */
export function opportunityMatchClauses(
  query: Pick<
    OpportunityQuery,
    'q' | 'category' | 'geography' | 'specialty' | 'workMode' | 'payStatus' | 'kazakhstanEligible'
  >,
  { catalogue = false }: { catalogue?: boolean } = {},
) {
  const text = fold(Prisma.sql`concat_ws(' ', r."title", r."summary", r."geography")`);
  const includes = (term: string) => Prisma.sql`position(${term.toLowerCase()} in ${text}) > 0`;
  const clauses: Prisma.Sql[] = [];
  if (query.q) {
    const terms = catalogue ? expandSearchTerms(query.q) : [query.q];
    clauses.push(
      terms.length === 1
        ? includes(terms[0])
        : Prisma.sql`(${Prisma.join(terms.map(includes), ' OR ')})`,
    );
  }
  if (query.workMode)
    clauses.push(
      catalogue
        ? Prisma.sql`(r."workMode" = ${query.workMode} OR ${query.workMode} = ANY(r."alsoWorkModes"))`
        : Prisma.sql`r."workMode" = ${query.workMode}`,
    );
  if (query.payStatus) clauses.push(Prisma.sql`r."payStatus" = ${query.payStatus}`);
  if (query.kazakhstanEligible) clauses.push(Prisma.sql`r."kazakhstanEligible" = true`);
  if (query.category) clauses.push(Prisma.sql`r."category" = ${query.category}`);
  if (query.geography)
    clauses.push(
      Prisma.sql`position(${query.geography.toLowerCase()} in translate(lower(r."geography"), ${upper}, ${lower})) > 0`,
    );
  if (query.specialty)
    clauses.push(
      Prisma.sql`(${Prisma.join(specialtyTerms[query.specialty].map(includes), ' OR ')})`,
    );
  return clauses;
}

const publicClause = Prisma.sql`i."status" = 'published' AND i."expiresAt" > timezone('UTC', now()) AND s."enabled" = true AND i."approvedAt" IS NOT NULL AND r."canonicalUrl" IS NOT NULL`;
const publicFrom = Prisma.sql`FROM "ContentItem" i JOIN "ContentSource" s ON s.id = i."sourceId" JOIN "ContentRevision" r ON r.id = i."approvedRevisionId"`;
const filterKeys = [
  'q',
  'category',
  'specialty',
  'geography',
  'workMode',
  'payStatus',
  'kazakhstanEligible',
  'added',
  'deadline',
  'hours',
  'noExperience',
] as const;
type FilterKey = (typeof filterKeys)[number];
type FacetQuery = Pick<OpportunityQuery, FilterKey>;

/**
 * Catalogue-only views: recently published, a deadline soon, a weekly-hours ceiling and no
 * experience required. Items without a confirmed value never match them.
 */
function timeClauses(
  query: Pick<OpportunityQuery, 'added' | 'deadline' | 'hours' | 'noExperience'>,
) {
  const now = Prisma.sql`timezone('UTC', now())`;
  const days = (value: string) => Prisma.sql`(${Number(value)}::int * interval '1 day')`;
  const clauses: Prisma.Sql[] = [];
  if (query.added) clauses.push(Prisma.sql`i."approvedAt" >= ${now} - ${days(query.added)}`);
  if (query.deadline)
    clauses.push(
      Prisma.sql`r."deadline" > ${now} AND r."deadline" <= ${now} + ${days(query.deadline)}`,
    );
  if (query.hours)
    clauses.push(
      Prisma.sql`r."hoursPerWeekMax" IS NOT NULL AND r."hoursPerWeekMax" <= ${Number(query.hours)}`,
    );
  if (query.noExperience) clauses.push(Prisma.sql`r."noExperience" = true`);
  return clauses;
}

/**
 * Counts for the current search. Each group ignores its own filter, so a count says how many
 * results choosing that value would give. `relaxed` is only filled when nothing matched and
 * says how many results remain after removing one applied filter.
 */
export async function searchPublicFacets(
  query: FacetQuery,
  total: number,
  database: Prisma.TransactionClient = db,
) {
  const without = (key: FilterKey) =>
    ({
      ...query,
      [key]: key === 'q' || key === 'geography' ? '' : undefined,
    }) as FacetQuery;
  const where = (value: FacetQuery) =>
    Prisma.join(
      [publicClause, ...opportunityMatchClauses(value, { catalogue: true }), ...timeClauses(value)],
      ' AND ',
    );
  const grouped = async (key: 'category' | 'workMode' | 'payStatus') => {
    // An opportunity counts under its main format and under every extra format it also offers.
    const column = Prisma.raw(key === 'workMode' ? 'format' : `r."${key}"`);
    const source =
      key === 'workMode'
        ? Prisma.sql`CROSS JOIN LATERAL unnest(array_append(r."alsoWorkModes", r."workMode")) AS format`
        : Prisma.empty;
    const rows = await database.$queryRaw<{ value: string; total: bigint }[]>(
      Prisma.sql`SELECT ${column} AS value, count(*) AS total ${publicFrom} ${source} WHERE ${where(without(key))} AND ${column} IS NOT NULL GROUP BY 1`,
    );
    return Object.fromEntries(rows.map((row) => [row.value, Number(row.total)]));
  };
  const count = async (value: FacetQuery) => {
    const rows = await database.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT count(*) AS total ${publicFrom} WHERE ${where(value)}`,
    );
    return Number(rows[0].total);
  };
  const eligible = await count({ ...without('kazakhstanEligible'), kazakhstanEligible: 'true' });
  const relaxed: Record<string, number> = {};
  if (total === 0)
    for (const key of filterKeys) if (query[key]) relaxed[key] = await count(without(key));
  return {
    category: await grouped('category'),
    workMode: await grouped('workMode'),
    payStatus: await grouped('payStatus'),
    kazakhstanEligible: eligible,
    relaxed,
  };
}

/** Newest currently public items of one type, for the "similar opportunities" block. */
export async function searchSimilarCandidateIds(
  category: string,
  excludeId: string,
  take: number,
  database: Prisma.TransactionClient = db,
) {
  const rows = await database.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT i.id ${publicFrom} WHERE ${publicClause} AND r."category" = ${category} AND i.id <> ${excludeId} ORDER BY i."approvedAt" DESC, i.id DESC LIMIT ${take}`,
  );
  return rows.map((row) => row.id);
}

/** Queue filters apply to the latest immutable revision, including unpublished materials. */
export async function searchContentQueue(
  query: OpportunityQuery,
  status?: string,
  publicOnly = false,
  limit = 20,
  database: Prisma.TransactionClient = db,
) {
  const clauses = opportunityMatchClauses(query, { catalogue: publicOnly });
  if (status) clauses.push(Prisma.sql`i."status" = ${status}`);
  if (publicOnly) clauses.push(publicClause, ...timeClauses(query));
  const revisionJoin = publicOnly
    ? Prisma.sql`JOIN "ContentRevision" r ON r.id = i."approvedRevisionId"`
    : Prisma.sql`JOIN LATERAL (SELECT * FROM "ContentRevision" WHERE "itemId" = i.id ORDER BY "number" DESC LIMIT 1) r ON true`;
  const from = Prisma.sql`FROM "ContentItem" i JOIN "ContentSource" s ON s.id = i."sourceId" ${revisionJoin} WHERE ${clauses.length ? Prisma.join(clauses, ' AND ') : Prisma.sql`true`}`;
  // Relevance: exact title, then the text or a synonym in the title, then in the summary.
  const relevance = (text: string) => {
    const terms = expandSearchTerms(text);
    return Prisma.sql`CASE WHEN ${fold(Prisma.sql`r."title"`)} = ${text.trim().toLowerCase()} THEN 4 WHEN ${containsAny(Prisma.sql`r."title"`, terms)} THEN 3 WHEN ${containsAny(Prisma.sql`r."summary"`, terms)} THEN 2 ELSE 1 END DESC, `;
  };
  const order = publicOnly
    ? query.sort === 'deadline'
      ? Prisma.sql`r."deadline" ASC NULLS LAST, i.id DESC`
      : Prisma.sql`${query.sort === 'relevance' && query.q ? relevance(query.q) : Prisma.empty}i."approvedAt" DESC, i.id DESC`
    : Prisma.sql`i."updatedAt" DESC, i.id DESC`;
  // The window count is taken before LIMIT/OFFSET, so one pass over the joins returns the total.
  const rows = await database.$queryRaw<{ id: string; total: bigint }[]>(
    Prisma.sql`SELECT i.id, count(*) OVER() AS total ${from} ORDER BY ${order} LIMIT ${limit} OFFSET ${(query.page - 1) * limit}`,
  );
  if (rows.length) return { ids: rows.map((row) => row.id), total: Number(rows[0].total) };
  // A page past the end has no rows to carry the window count.
  if (query.page === 1) return { ids: [], total: 0 };
  const counts = await database.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`SELECT count(*) AS total ${from}`,
  );
  return { ids: [], total: Number(counts[0].total) };
}
