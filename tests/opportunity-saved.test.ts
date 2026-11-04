import { describe, expect, it } from 'vitest';
import {
  normalizeOpportunityFilters,
  opportunitySavedCommand,
  opportunitySearchKey,
  opportunitySearchUrl,
} from '../src/lib/opportunity-saved';

describe('saved opportunity criteria', () => {
  it('normalizes RU/KZ case, compatible Unicode and whitespace before deduplication', () => {
    const first = normalizeOpportunityFilters({
      q: '  ГРАНТ\tӘЛЕМ  ',
      geography: '  ҚАЗАҚСТАН\n АСТАНА ',
      specialty: 'health',
    });
    const second = normalizeOpportunityFilters({
      geography: 'қазақстан астана',
      q: 'грант әлем',
      specialty: 'health',
    });
    expect(first).toEqual(second);
    expect(opportunitySearchKey(first)).toBe(opportunitySearchKey(second));
    expect(normalizeOpportunityFilters({ q: 'ＦＵＮＤ' }).q).toBe('fund');
  });
  it('treats omitted and explicitly empty criteria as the same search', () => {
    expect(opportunitySearchKey(normalizeOpportunityFilters({}))).toBe(
      opportunitySearchKey(normalizeOpportunityFilters({ q: '  ', geography: '' })),
    );
  });
  it('keeps distinct specialty and category choices distinct', () => {
    expect(opportunitySearchKey(normalizeOpportunityFilters({ specialty: 'health' }))).not.toBe(
      opportunitySearchKey(normalizeOpportunityFilters({ specialty: 'education' })),
    );
    expect(opportunitySearchKey(normalizeOpportunityFilters({ category: 'grant' }))).not.toBe(
      opportunitySearchKey(normalizeOpportunityFilters({ category: 'internship' })),
    );
  });
  it('builds a local criteria URL without letting search text add query parameters', () => {
    const filters = normalizeOpportunityFilters({
      q: 'Грант & next=https://example.org',
      geography: 'Астана',
      category: 'grant',
    });
    const result = new URL(opportunitySearchUrl(filters), 'https://qosyl.example');
    expect(result.pathname).toBe('/opportunities');
    expect(result.searchParams.get('q')).toBe(filters.q);
    expect(result.searchParams.get('geography')).toBe('астана');
    expect(result.searchParams.has('next')).toBe(false);
    expect(result.searchParams.has('page')).toBe(false);
    expect(opportunitySearchUrl(normalizeOpportunityFilters({}))).toBe('/opportunities');
  });
  it.each(['page', 'limit', 'userId'])('rejects non-criteria field %s', (field) => {
    expect(() =>
      normalizeOpportunityFilters({ [field]: field === 'userId' ? 'another-user' : 2 }),
    ).toThrow();
  });
  it('revalidates bounds after Unicode expansion', () => {
    expect(() => normalizeOpportunityFilters({ q: 'ﬃ'.repeat(80) })).toThrow();
  });
  it('rejects invalid enum values and oversized query text', () => {
    expect(() => normalizeOpportunityFilters({ specialty: 'all-students' })).toThrow();
    expect(() => normalizeOpportunityFilters({ category: 'job' })).toThrow();
    expect(() => normalizeOpportunityFilters({ q: 'a'.repeat(101) })).toThrow();
  });
  it('never accepts another owner or empty targets in a mutation', () => {
    expect(
      opportunitySavedCommand.safeParse({
        action: 'saveFavorite',
        itemId: 'item',
        userId: 'another-user',
      }).success,
    ).toBe(false);
    expect(
      opportunitySavedCommand.safeParse({ action: 'removeFavorite', favoriteId: '' }).success,
    ).toBe(false);
    expect(
      opportunitySavedCommand.safeParse({ action: 'saveSearch', name: '  ', filters: {} }).success,
    ).toBe(false);
    expect(
      opportunitySavedCommand.safeParse({
        action: 'removeSearch',
        searchId: 'search',
        userId: 'another-user',
      }).success,
    ).toBe(false);
  });
  it('accepts only explicit local notification frequencies and never caller-owned scheduling', () => {
    for (const frequency of ['off', 'daily', 'weekly'])
      expect(
        opportunitySavedCommand.safeParse({
          action: 'setSearchNotifications',
          searchId: 'own',
          frequency,
        }).success,
      ).toBe(true);
    for (const extra of [
      { frequency: 'hourly' },
      { userId: 'other' },
      { nextNotificationAt: '2026-10-27T00:00:00Z' },
      { channel: 'email' },
      { notificationSince: '2020-01-01' },
    ])
      expect(
        opportunitySavedCommand.safeParse({
          action: 'setSearchNotifications',
          searchId: 'own',
          frequency: 'daily',
          ...extra,
        }).success,
      ).toBe(false);
  });
});
