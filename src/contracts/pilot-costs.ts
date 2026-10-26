import { z } from 'zod';
import { pilotCostKinds } from '../lib/pilot-cost-validation';

const count = z.number().int().nonnegative();
const date = z.iso.datetime({ offset: true });
export const pilotCostEntrySchema = z.strictObject({
  id: z.string().min(1),
  recordedById: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  kind: z.enum(pilotCostKinds),
  occurredAt: date,
  minutes: count,
  amountKzt: count,
  description: z.string(),
  idempotencyKey: z.uuid(),
  createdAt: date,
  voidedAt: date.nullable(),
  voidedById: z.string().min(1).nullable(),
  voidReason: z.string().nullable(),
});
export const pilotCostsDataSchema = z.strictObject({
  entries: z.array(pilotCostEntrySchema),
  totals: z.strictObject({
    minutes: count,
    amountKzt: count,
    entries: count,
    voidedEntries: count,
  }),
  page: z.number().int().min(1).max(10_000),
  hasMore: z.boolean(),
});
export type PilotCostsData = z.infer<typeof pilotCostsDataSchema>;
