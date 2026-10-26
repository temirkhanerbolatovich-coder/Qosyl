import { describe, expect, it } from 'vitest';
import { parseCatalogQuery } from '../src/lib/catalog-query';

describe('catalog query contract', () => {
  it('uses defaults for empty form fields', () => {
    expect(parseCatalogQuery(new URLSearchParams('page=&minBudget=&sort='))).toMatchObject({
      page: 1,
      sort: 'newest',
    });
  });
  it.each([
    'page=1.5',
    'page=0',
    'page=10001',
    'minBudget=2147483648',
    'maxBudget=-1',
    'minBudget=200&maxBudget=100',
    'maxHours=161',
    'maxHours=1.5',
    'category=unknown',
    'mode=unknown',
    'difficulty=expert',
    'sort=unknown',
    'dueBefore=2026-02-31',
    'dueBefore=2026-10-01T15:00:00',
  ])('rejects invalid filters before database access: %s', (query) => {
    expect(() => parseCatalogQuery(new URLSearchParams(query))).toThrow();
  });
  it('accepts leap days and uses end of UTC+05 day for a calendar cutoff', () => {
    expect(parseCatalogQuery(new URLSearchParams('dueBefore=2028-02-29')).dueBefore).toBe(
      '2028-02-29T23:59:59.999+05:00',
    );
    expect(
      parseCatalogQuery(new URLSearchParams({ dueBefore: '2028-02-29T12:00:00+05:00' })).dueBefore,
    ).toBe('2028-02-29T12:00:00+05:00');
  });
  it('accepts existing UI values and bounds search input', () => {
    expect(
      parseCatalogQuery(
        new URLSearchParams('category=spreadsheets&minBudget=0&maxHours=5&page=2&sort=relevance'),
      ),
    ).toMatchObject({ category: 'spreadsheets', minBudget: 0, maxHours: 5, page: 2 });
    expect(() => parseCatalogQuery(new URLSearchParams({ q: 'x'.repeat(151) }))).toThrow();
  });
});
