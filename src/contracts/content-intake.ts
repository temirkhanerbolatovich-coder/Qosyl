import { z } from 'zod';
import { contentStatuses, manualCategories } from '@/lib/content-validation';
const id = z.string().min(1),
  date = z.iso.datetime({ offset: true }),
  count = z.number().int().nonnegative();
export const contentSourceSchema = z.strictObject({
  id,
  name: z.string(),
  type: z.enum(['manual', 'rss', 'html']),
  feedUrl: z.string().nullable(),
  allowedHost: z.string(),
  enabled: z.boolean(),
  rightsNote: z.string(),
  termsUrl: z.string().nullable(),
  intervalMinutes: z.number().int(),
  maxItems: z.number().int(),
  lastCheckedAt: date.nullable(),
  lastSuccessAt: date.nullable(),
  consecutiveErrors: count,
  nextRunAt: date.nullable(),
  createdAt: date,
  updatedAt: date,
});
export const contentRevisionSchema = z.strictObject({
  id,
  itemId: id,
  canonicalUrl: z.string().nullable(),
  origin: z.enum(['legacy', 'import', 'manual', 'editorial']),
  number: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  category: z.enum(manualCategories),
  geography: z.string(),
  workMode: z.enum(['remote', 'in_person', 'hybrid']).nullable().default(null),
  payStatus: z.enum(['paid', 'unpaid']).nullable().default(null),
  kazakhstanEligible: z.boolean().nullable().default(null),
  workFormat: z.string().nullable().default(null),
  kazakhstanEligibility: z.string().nullable().default(null),
  workload: z.string().nullable().default(null),
  compensation: z.string().nullable().default(null),
  hoursPerWeekMax: z.number().int().min(1).max(60).nullable().default(null),
  noExperience: z.boolean().nullable().default(null),
  alsoWorkModes: z
    .array(z.enum(['remote', 'in_person', 'hybrid']))
    .max(2)
    .default([]),
  language: z.string(),
  publishedAt: date.nullable(),
  publishedAtRaw: z.string().nullable(),
  deadline: date.nullable(),
  eventDate: date.nullable(),
  score: z.number().int().min(0).max(100),
  contentHash: z.string(),
  createdAt: date,
});
export const contentItemSchema = z.strictObject({
  id,
  sourceId: id,
  externalId: z.string().nullable(),
  canonicalUrl: z.string(),
  urlHash: z.string(),
  status: z.enum(contentStatuses),
  approvedRevisionId: id.nullable(),
  approvedAt: date.nullable(),
  expiresAt: date.nullable(),
  createdAt: date,
  updatedAt: date,
  revisions: z.array(contentRevisionSchema),
});
export const crawlRunSchema = z.strictObject({
  id,
  sourceId: id,
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'skipped']),
  requestedById: id.nullable(),
  requestedAt: date,
  startedAt: date.nullable(),
  finishedAt: date.nullable(),
  leaseUntil: date.nullable(),
  found: count,
  created: count,
  updated: count,
  duplicates: count,
  discarded: count,
  errorCode: z.string().nullable(),
  httpStatus: z.number().int().nullable(),
});
export const contentIntakeDataSchema = z.strictObject({
  settings: z.strictObject({ id: z.literal('content'), enabled: z.boolean(), updatedAt: date }),
  sources: z.array(contentSourceSchema),
  items: z.array(contentItemSchema),
  runs: z.array(crawlRunSchema),
  page: z.number().int().positive(),
  total: count,
});
export const contentMutationDataSchema = z.union([
  z.strictObject({ saved: z.literal(true) }),
  z.strictObject({ sourceId: id }),
  z.strictObject({ runId: id, status: z.enum(['queued', 'running']) }),
  z.strictObject({ kind: z.enum(['created', 'updated', 'duplicate']), itemId: id }),
]);
export const contentAuditSchema = z.strictObject({
  id,
  actorId: id.nullable(),
  sourceId: id.nullable(),
  itemId: id.nullable(),
  revisionId: id.nullable(),
  action: z.string(),
  reason: z.string(),
  createdAt: date,
});
export const contentDetailDataSchema = z.strictObject({
  item: contentItemSchema,
  source: contentSourceSchema,
  history: z.array(contentRevisionSchema),
  historyPage: z.number().int().positive(),
  historyTotal: count,
  audits: z.array(contentAuditSchema),
});
export const publicContentPostSchema = z.strictObject({
  id,
  title: z.string(),
  summary: z.string(),
  category: z.enum(manualCategories),
  geography: z.string(),
  workMode: z.enum(['remote', 'in_person', 'hybrid']).nullable().default(null),
  payStatus: z.enum(['paid', 'unpaid']).nullable().default(null),
  kazakhstanEligible: z.boolean().nullable().default(null),
  workFormat: z.string().nullable().default(null),
  kazakhstanEligibility: z.string().nullable().default(null),
  workload: z.string().nullable().default(null),
  compensation: z.string().nullable().default(null),
  hoursPerWeekMax: z.number().int().min(1).max(60).nullable().default(null),
  noExperience: z.boolean().nullable().default(null),
  alsoWorkModes: z
    .array(z.enum(['remote', 'in_person', 'hybrid']))
    .max(2)
    .default([]),
  language: z.string(),
  url: z.string(),
  sourceName: z.string(),
  publishedAt: date.nullable(),
  approvedAt: date,
  expiresAt: date,
  deadline: date.nullable(),
  eventDate: date.nullable(),
});
export const publicContentDataSchema = z.strictObject({
  posts: z.array(publicContentPostSchema).max(6),
  total: z.number().int().nonnegative(),
  /** Present only when the request asks for `facets=true`. */
  facets: z
    .strictObject({
      category: z.record(z.string(), z.number().int().nonnegative()),
      workMode: z.record(z.string(), z.number().int().nonnegative()),
      payStatus: z.record(z.string(), z.number().int().nonnegative()),
      kazakhstanEligible: z.number().int().nonnegative(),
      relaxed: z.record(z.string(), z.number().int().nonnegative()),
    })
    .optional(),
});
export type ContentIntakeData = z.infer<typeof contentIntakeDataSchema>;
export type ContentDetailData = z.infer<typeof contentDetailDataSchema>;
export type PublicContentPost = z.infer<typeof publicContentPostSchema>;
export type OpportunityFacets = NonNullable<z.infer<typeof publicContentDataSchema>['facets']>;
