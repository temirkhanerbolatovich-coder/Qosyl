import { z } from 'zod';

const date = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
export const backgroundJobsDataSchema = z.strictObject({
  settings: z.strictObject({
    enabled: z.boolean(),
    intervalMs: z.number().int().min(1000).max(86400000),
    batchSize: z.number().int().min(1).max(50),
  }),
  runs: z.array(
    z.strictObject({
      id: z.string().min(1),
      job: z.literal('project-lifecycle'),
      status: z.enum(['completed', 'busy', 'failed']),
      startedAt: date,
      finishedAt: date,
      expiredProjects: count,
      remindersCreated: count,
      scannedProjects: count,
      errorCode: z.string().nullable(),
      nextCursor: z.string().nullable(),
    }),
  ),
});
