import { z } from 'zod';

export const threadsSearchInput = z.strictObject({ query: z.string().trim().min(2).max(100) });
export const threadsCandidateSchema = z.strictObject({
  externalId: z.string().regex(/^\d{1,40}$/),
  sourceUrl: z.url(),
  sourceName: z.string().max(120),
  title: z.string().min(8).max(140),
  summary: z.string().min(20).max(2000),
  publishedAt: z.iso.datetime(),
});
export const threadsSearchDataSchema = z.strictObject({
  items: z.array(threadsCandidateSchema).max(25),
  discarded: z.number().int().nonnegative(),
  searchType: z.literal('RECENT'),
  limited: z.literal(true),
});
export const threadsStatusDataSchema = z.strictObject({
  enabled: z.boolean(),
  configured: z.boolean(),
});
export type ThreadsCandidate = z.infer<typeof threadsCandidateSchema>;

/** Secrets stay server-side; do not serialize this settings object. */
export function threadsSettings(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: env.THREADS_SEARCH_ENABLED === 'true',
    token: env.THREADS_ACCESS_TOKEN?.trim() || '',
  };
}
