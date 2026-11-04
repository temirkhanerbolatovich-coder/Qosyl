import { z } from 'zod';
import { opportunityFilters } from './content-validation';

export const savedOpportunityFilters = z.strictObject(opportunityFilters);
export type SavedOpportunityFilters = z.infer<typeof savedOpportunityFilters>;
const text = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

/** Pagination never changes the identity of a saved search. */
export function normalizeOpportunityFilters(input: unknown): SavedOpportunityFilters {
  const parsed = savedOpportunityFilters.parse(input);
  return savedOpportunityFilters.parse({
    q: text(parsed.q),
    ...(parsed.category ? { category: parsed.category } : {}),
    geography: text(parsed.geography),
    ...(parsed.specialty ? { specialty: parsed.specialty } : {}),
  });
}
export function opportunitySearchKey(filters: SavedOpportunityFilters) {
  const value = normalizeOpportunityFilters(filters);
  return JSON.stringify([value.q, value.category ?? '', value.geography, value.specialty ?? '']);
}
export function opportunitySearchUrl(input: SavedOpportunityFilters) {
  const filters = normalizeOpportunityFilters(input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return '/opportunities' + (params.size ? '?' + params.toString() : '');
}
const id = z.string().trim().min(1).max(100);
export const opportunityNotificationFrequency = z.enum(['off', 'daily', 'weekly']);
export const opportunityNotificationDelay = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;
export const opportunitySavedCommand = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('saveFavorite'), itemId: id }),
  z.strictObject({ action: z.literal('removeFavorite'), favoriteId: id }),
  z.strictObject({
    action: z.literal('saveSearch'),
    name: z.string().trim().min(1).max(80),
    filters: savedOpportunityFilters,
  }),
  z.strictObject({ action: z.literal('removeSearch'), searchId: id }),
  z.strictObject({
    action: z.literal('setSearchNotifications'),
    searchId: id,
    frequency: opportunityNotificationFrequency,
  }),
]);
