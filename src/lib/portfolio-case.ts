import { z } from 'zod';
import { safePortfolioUrl } from './profile-links';
import { isPrivateAttachmentLink } from './project-attachments';

export const caseLink = safePortfolioUrl.refine(
  (value) => !isPrivateAttachmentLink(value),
  'Закрытые вложения нельзя добавлять в кейс.',
);
export const caseFields = z
  .strictObject({
    title: z.string().trim().min(2).max(150),
    description: z.string().trim().max(1000),
    role: z.string().trim().max(150),
    problem: z.string().trim().max(1500),
    contribution: z.string().trim().max(1500),
    period: z.string().trim().max(100),
    tools: z.array(z.string().trim().min(1).max(60)).max(15),
    result: z.string().trim().max(1500),
    url: z.union([z.literal(''), caseLink]),
    links: z.array(caseLink).max(5),
    visibility: z.enum(['draft', 'private', 'public']),
    publicationAllowed: z.boolean(),
  })
  .refine((value) => value.visibility !== 'public' || value.publicationAllowed, {
    path: ['publicationAllowed'],
    message: 'Подтвердите разрешение публикации результата.',
  });
export type CaseFields = z.infer<typeof caseFields>;
export const caseCommand = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('create'), data: caseFields }),
  z.strictObject({
    action: z.literal('update'),
    id: z.string().min(1).max(100),
    revision: z.string().min(1).max(100),
    data: caseFields,
  }),
  z.strictObject({
    action: z.literal('delete'),
    id: z.string().min(1).max(100),
    revision: z.string().min(1).max(100),
  }),
  z.strictObject({
    action: z.literal('reorder'),
    items: z
      .array(
        z.strictObject({ id: z.string().min(1).max(100), revision: z.string().min(1).max(100) }),
      )
      .max(30),
  }),
]);
export const caseItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  role: z.string(),
  problem: z.string(),
  contribution: z.string(),
  period: z.string(),
  tools: z.array(z.string()),
  result: z.string(),
  links: z.array(z.string()),
  visibility: z.enum(['draft', 'private', 'public']),
  publicationAllowed: z.boolean(),
  revision: z.string(),
  position: z.number().int(),
});
export const caseListResponse = z.object({ data: z.object({ items: z.array(caseItemSchema) }) });
export type PortfolioCase = z.infer<typeof caseItemSchema>;
export const caseOrder = [
  { position: 'asc' as const },
  { createdAt: 'desc' as const },
  { id: 'asc' as const },
];
export const publicCaseWhere = { visibility: 'public', publicationAllowed: true } as const;
