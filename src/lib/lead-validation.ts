import { z } from 'zod';
import { projectFields } from './validation';
export const leadKinds = ['business_request', 'discussion'] as const;
export const leadStatuses = [
  'new',
  'verified',
  'contacted',
  'consented',
  'declined',
  'archived',
  'converted',
] as const;
const id = z.string().trim().min(1).max(100),
  reason = z.string().trim().min(10).max(2000);
const expiresAt = z.iso.datetime({ offset: true }).refine((value) => {
  const time = new Date(value).getTime();
  return time > Date.now() && time <= Date.now() + 90 * 86400000;
}, 'Срок актуальности должен быть в будущем, не дальше 90 дней.');
const fields = z.object({
  title: z.string().trim().min(8).max(140),
  summary: z.string().trim().min(20).max(2000),
  sourceName: z.string().trim().min(3).max(120),
  expiresAt,
});
const version = z.object({ leadId: id, expectedVersion: z.number().int().positive() });
export const leadCreateInput = fields.extend({
  kind: z.enum(leadKinds),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port;
    }, 'Нужна HTTPS-ссылка без реквизитов и нестандартного порта.'),
  assignedToId: id,
});
export const leadActionInputs = {
  createLead: leadCreateInput,
  editLead: version.extend({ ...fields.shape, reason }),
  assignLead: version.extend({ assignedToId: id, reason }),
  verifyLead: version.extend({ reason }),
  recordContact: version.extend({ reason }),
  recordConsent: version.extend({ clientId: id, evidence: reason }),
  revokeConsent: version.extend({ reason }),
  closeLead: version.extend({ decision: z.enum(['declined', 'archived']), reason }),
  reopenLead: version.extend({ reason }),
  addLeadNote: version.extend({ reason }),
};
export const leadCommandSchema = z.discriminatedUnion('action', [
  leadActionInputs.createLead.extend({ action: z.literal('createLead') }),
  leadActionInputs.editLead.extend({ action: z.literal('editLead') }),
  leadActionInputs.assignLead.extend({ action: z.literal('assignLead') }),
  leadActionInputs.verifyLead.extend({ action: z.literal('verifyLead') }),
  leadActionInputs.recordContact.extend({ action: z.literal('recordContact') }),
  leadActionInputs.recordConsent.extend({ action: z.literal('recordConsent') }),
  leadActionInputs.revokeConsent.extend({ action: z.literal('revokeConsent') }),
  leadActionInputs.closeLead.extend({ action: z.literal('closeLead') }),
  leadActionInputs.reopenLead.extend({ action: z.literal('reopenLead') }),
  leadActionInputs.addLeadNote.extend({ action: z.literal('addLeadNote') }),
]);
export const leadQueryInput = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  kind: z.enum(leadKinds).optional(),
  status: z.enum(leadStatuses).optional(),
});
export const leadConversionInput = z.object({
  leadId: id,
  expectedVersion: z.number().int().positive(),
  confirmation: z.literal(true),
  project: projectFields,
});
