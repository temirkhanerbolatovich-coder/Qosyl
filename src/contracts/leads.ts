import { z } from 'zod';
import { leadKinds, leadStatuses } from '@/lib/lead-validation';
const id = z.string().min(1),
  date = z.iso.datetime({ offset: true }),
  count = z.number().int().nonnegative();
export const leadSchema = z.strictObject({
  id,
  kind: z.enum(leadKinds),
  sourceUrl: z.string(),
  urlHash: z.string(),
  sourceName: z.string(),
  title: z.string(),
  summary: z.string(),
  status: z.enum(leadStatuses),
  version: z.number().int().positive(),
  createdById: id,
  assignedToId: id,
  verifiedAt: date.nullable(),
  contactedAt: date.nullable(),
  consentAt: date.nullable(),
  consentEvidence: z.string().nullable(),
  clientId: id.nullable(),
  projectId: id.nullable(),
  conversionHash: z.string().nullable(),
  expiresAt: date,
  createdAt: date,
  updatedAt: date,
});
export const leadEventSchema = z.strictObject({
  id,
  leadId: id,
  actorId: id,
  version: z.number().int().positive(),
  action: z.string(),
  note: z.string(),
  detailsJson: z.record(z.string(), z.string()),
  createdAt: date,
});
const actor = z.strictObject({ id, name: z.string() });
export const leadListDataSchema = z.strictObject({
  leads: z.array(leadSchema),
  total: count,
  page: z.number().int().positive(),
  operators: z.array(actor),
  clients: z.array(actor),
});
export const leadDetailDataSchema = z.strictObject({
  lead: leadSchema,
  events: z.array(leadEventSchema),
  page: z.number().int().positive(),
  total: count,
});
export const leadMutationDataSchema = z.strictObject({
  leadId: id,
  version: z.number().int().positive(),
});
export const leadHandoffSchema = z.strictObject({
  id,
  version: z.number().int().positive(),
  status: z.enum(['consented', 'converted']),
  title: z.string(),
  summary: z.string(),
  sourceName: z.string(),
  sourceUrl: z.string(),
  expiresAt: date,
  projectId: id.nullable(),
});
export const leadHandoffsDataSchema = z.strictObject({
  leads: z.array(leadHandoffSchema),
  total: count,
  page: z.number().int().positive(),
});
export const leadConversionDataSchema = z.strictObject({ projectId: id });
export type LeadListData = z.infer<typeof leadListDataSchema>;
export type LeadDetailData = z.infer<typeof leadDetailDataSchema>;
export type LeadHandoff = z.infer<typeof leadHandoffSchema>;
