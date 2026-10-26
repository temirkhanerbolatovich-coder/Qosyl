import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { OpportunityQuery } from '@/lib/content-validation';
import { specialtyTerms } from '@/lib/opportunity-search';

/** Queue filters apply to the latest immutable revision, including unpublished materials. */
export async function searchContentQueue(
  query: OpportunityQuery,
  status?: string,
  publicOnly = false,
  limit = 20,
  database: Prisma.TransactionClient = db,
) {
  // Local PostgreSQL can use a C locale, whose lower() does not fold Cyrillic.
  const upper = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯӘҒҚҢӨҰҮҺІ';
  const lower = upper.toLowerCase();
  const text = Prisma.sql`translate(lower(concat_ws(' ', r."title", r."summary", r."geography")), ${upper}, ${lower})`;
  const includes = (term: string) => Prisma.sql`position(${term.toLowerCase()} in ${text}) > 0`;
  const clauses: Prisma.Sql[] = [];
  if (query.q) clauses.push(includes(query.q));
  if (query.category) clauses.push(Prisma.sql`r."category" = ${query.category}`);
  if (query.geography)
    clauses.push(
      Prisma.sql`position(${query.geography.toLowerCase()} in translate(lower(r."geography"), ${upper}, ${lower})) > 0`,
    );
  if (query.specialty)
    clauses.push(
      Prisma.sql`(${Prisma.join(specialtyTerms[query.specialty].map(includes), ' OR ')})`,
    );
  if (status) clauses.push(Prisma.sql`i."status" = ${status}`);
  if (publicOnly)
    clauses.push(
      Prisma.sql`i."status" = 'published' AND i."expiresAt" > timezone('UTC', now()) AND s."enabled" = true`,
    );
  const revisionJoin = publicOnly
    ? Prisma.sql`JOIN "ContentRevision" r ON r.id = i."approvedRevisionId"`
    : Prisma.sql`JOIN LATERAL (SELECT * FROM "ContentRevision" WHERE "itemId" = i.id ORDER BY "number" DESC LIMIT 1) r ON true`;
  const from = Prisma.sql`FROM "ContentItem" i JOIN "ContentSource" s ON s.id = i."sourceId" ${revisionJoin} WHERE ${clauses.length ? Prisma.join(clauses, ' AND ') : Prisma.sql`true`}`;
  const order = publicOnly
    ? Prisma.sql`i."approvedAt" DESC, i.id DESC`
    : Prisma.sql`i."updatedAt" DESC, i.id DESC`;
  const [rows, counts] = await Promise.all([
    database.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT i.id ${from} ORDER BY ${order} LIMIT ${limit} OFFSET ${(query.page - 1) * limit}`,
    ),
    database.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total ${from}`),
  ]);
  return { ids: rows.map((row) => row.id), total: Number(counts[0].total) };
}
