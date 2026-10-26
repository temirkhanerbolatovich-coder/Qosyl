import { z } from 'zod';

export const pilotCostKinds = ['acquisition', 'moderation', 'support', 'operations'] as const;
export const recordPilotCostInput = z
  .object({
    idempotencyKey: z.uuid(),
    projectId: z.string().trim().min(1).max(100).optional(),
    kind: z.enum(pilotCostKinds),
    occurredAt: z.iso
      .datetime({ offset: true })
      .refine(
        (value) => Date.parse(value) <= Date.now() + 5 * 60_000,
        'Дата расхода не может быть в будущем.',
      ),
    minutes: z.number().int().min(0).max(100_000),
    amountKzt: z.number().int().min(0).max(10_000_000),
    description: z.string().trim().min(3).max(1_000),
  })
  .refine((value) => value.minutes > 0 || value.amountKzt > 0, {
    message: 'Укажите время или денежный расход.',
    path: ['amountKzt'],
  });

export const voidPilotCostInput = z.object({
  costId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(10).max(1_000),
});
