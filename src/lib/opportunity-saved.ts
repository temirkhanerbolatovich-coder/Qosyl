import { z } from 'zod';
import {
  opportunityFilters,
  type OpportunityHours,
  type OpportunitySort,
  type OpportunityWindow,
} from './content-validation';

export const savedOpportunityFilters = z.strictObject(opportunityFilters);
export type SavedOpportunityFilters = z.infer<typeof savedOpportunityFilters>;
const text = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

/** Pagination never changes the identity of a saved search. */
export function normalizeOpportunityFilters(input: unknown): SavedOpportunityFilters {
  const parsed = savedOpportunityFilters.parse(input);
  return savedOpportunityFilters.parse({
    q: text(parsed.q),
    ...(parsed.category ? { category: parsed.category } : {}),
    ...(parsed.workMode ? { workMode: parsed.workMode } : {}),
    ...(parsed.payStatus ? { payStatus: parsed.payStatus } : {}),
    ...(parsed.kazakhstanEligible ? { kazakhstanEligible: parsed.kazakhstanEligible } : {}),
    geography: text(parsed.geography),
    ...(parsed.specialty ? { specialty: parsed.specialty } : {}),
  });
}
export function opportunitySearchKey(filters: SavedOpportunityFilters) {
  const value = normalizeOpportunityFilters(filters);
  const key = [value.q, value.category ?? '', value.geography, value.specialty ?? ''];
  if (value.workMode || value.payStatus || value.kazakhstanEligible)
    key.push(value.workMode ?? '', value.payStatus ?? '', value.kazakhstanEligible ?? '');
  return JSON.stringify(key);
}
/** Catalogue view settings that are not part of a saved search. */
export type OpportunityView = {
  sort?: OpportunitySort;
  added?: OpportunityWindow;
  deadline?: OpportunityWindow;
  hours?: OpportunityHours;
  noExperience?: 'true';
};
export function opportunitySearchUrl(
  input: SavedOpportunityFilters,
  {
    page = 1,
    sort = 'newest',
    added,
    deadline,
    hours,
    noExperience,
  }: OpportunityView & { page?: number } = {},
) {
  const filters = normalizeOpportunityFilters(input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (sort !== 'newest') params.set('sort', sort);
  if (added) params.set('added', added);
  if (deadline) params.set('deadline', deadline);
  if (hours) params.set('hours', hours);
  if (noExperience) params.set('noExperience', noExperience);
  if (page > 1) params.set('page', String(page));
  return '/opportunities' + (params.size ? '?' + params.toString() : '');
}
const id = z.string().trim().min(1).max(100);
export const opportunityNotificationFrequency = z.enum(['off', 'daily', 'weekly']);
export const opportunityNotificationDelay = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;
export const opportunityNoteMax = 300;
/** How many days before a confirmed deadline a saved opportunity may remind its owner. */
export const opportunityReminderDays = z.union([z.literal(1), z.literal(3), z.literal(7)]);
export type OpportunityReminderDays = z.infer<typeof opportunityReminderDays>;
export const opportunitySavedCommand = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('saveFavorite'), itemId: id }),
  z.strictObject({ action: z.literal('removeFavorite'), favoriteId: id }),
  z.strictObject({
    action: z.literal('setFavoriteReminder'),
    favoriteId: id,
    daysBefore: opportunityReminderDays.nullable(),
  }),
  z.strictObject({
    action: z.literal('setFavoriteNote'),
    favoriteId: id,
    // An empty note removes it.
    note: z.string().trim().max(opportunityNoteMax),
  }),
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
