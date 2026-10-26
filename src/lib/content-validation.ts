import { z } from 'zod';
import { contentCategories } from './opportunity-search';

export const sourceTypes = ['manual', 'rss', 'html'] as const;
export const manualCategories = contentCategories;
const id = z.string().trim().min(1).max(100);
const host = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(/^(?!.*\.\.)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/);
const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash;
  }, 'Нужна HTTPS-ссылка без реквизитов, фрагмента и нестандартного порта.');
const date = z.iso.datetime({ offset: true }).nullable().optional();

export const sourceInput = z
  .object({
    name: z.string().trim().min(3).max(100),
    type: z.enum(sourceTypes),
    feedUrl: httpsUrl.nullable().optional(),
    allowedHost: host,
    rightsNote: z.string().trim().min(10).max(2000),
    termsUrl: httpsUrl.nullable().optional(),
    enabled: z.boolean().default(false),
    intervalMinutes: z.number().int().min(60).max(10080).default(360),
    maxItems: z.number().int().min(1).max(100).default(50),
  })
  .superRefine((value, context) => {
    if (value.type !== 'manual' && !value.feedUrl)
      context.addIssue({
        code: 'custom',
        path: ['feedUrl'],
        message: 'Для автоматического источника укажите URL ленты или страницы.',
      });
    if (value.type === 'manual' && value.feedUrl)
      context.addIssue({
        code: 'custom',
        path: ['feedUrl'],
        message: 'Ручной источник не загружается из сети.',
      });
    if (value.feedUrl && new URL(value.feedUrl).hostname !== value.allowedHost)
      context.addIssue({
        code: 'custom',
        path: ['allowedHost'],
        message: 'Домен ленты должен точно совпадать с разрешённым доменом.',
      });
  });

export const manualContentInput = z.object({
  sourceId: id,
  url: httpsUrl,
  title: z.string().trim().min(8).max(200),
  summary: z.string().trim().max(600).default(''),
  category: z.enum(manualCategories).default('other'),
  geography: z.string().trim().max(120).default(''),
  language: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[a-z]{2,3}(?:-[a-z\d]{2,8})*$/i)
    .default('und'),
  publishedAt: date,
  deadline: date,
  eventDate: date,
});
export const contentSettingsInput = z.object({ enabled: z.boolean() });
export const requestSyncInput = z.object({ sourceId: id });
export const contentStatuses = [
  'pending_review',
  'published',
  'rejected',
  'archived',
  'withdrawn',
] as const;
export const contentQueueInput = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  status: z.enum(contentStatuses).optional(),
});
export const contentReviewInput = z
  .object({
    itemId: id,
    expectedRevisionId: id,
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    decision: z.enum(['publish', 'reject', 'archive', 'withdraw', 'reopen']),
    reason: z.string().trim().min(10).max(2000),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === 'publish' && !value.expiresAt)
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Укажите срок актуальности публикации.',
      });
  });
export const contentEditInput = manualContentInput.omit({ sourceId: true }).extend({
  itemId: id,
  expectedRevisionId: id,
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(10).max(2000),
});
export const opportunityFilters = {
  q: z.string().trim().max(100).default(''),
  category: z.enum(manualCategories).optional(),
  geography: z.string().trim().max(120).default(''),
  specialty: z
    .enum([
      'it',
      'engineering',
      'business',
      'education',
      'health',
      'humanities',
      'agriculture',
      'services',
    ])
    .optional(),
};
export const publicContentQueryInput = z.object({
  limit: z.coerce.number().int().min(1).max(6).default(6),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  ...opportunityFilters,
});
export type OpportunityQuery = z.infer<typeof publicContentQueryInput>;
export type SourceInput = z.infer<typeof sourceInput>;
export type ManualContentInput = z.infer<typeof manualContentInput>;
