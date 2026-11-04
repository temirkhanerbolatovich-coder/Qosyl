import { describe, expect, it } from 'vitest';
import { opportunityCategoryLabels, specialtyLabels } from '../src/lib/opportunity-search';
import {
  localizedOpportunityCategoryLabels,
  localizedSpecialtyLabels,
  opportunityContentLanguage,
} from '../src/lib/localized-opportunity-labels';

describe('localized opportunity labels', () => {
  it('retains the Russian dictionary and all filter identifiers in Kazakh', () => {
    expect(localizedOpportunityCategoryLabels('ru')).toBe(opportunityCategoryLabels);
    expect(localizedSpecialtyLabels('ru')).toBe(specialtyLabels);
    for (const [original, translated] of [
      [opportunityCategoryLabels, localizedOpportunityCategoryLabels('kk')],
      [specialtyLabels, localizedSpecialtyLabels('kk')],
    ]) {
      expect(Object.keys(translated).sort()).toEqual(Object.keys(original).sort());
      expect(Object.values(translated).every((label) => label.trim().length > 0)).toBe(true);
    }
  });
  it('uses the publication language without inferring it from the UI locale', () => {
    expect(opportunityContentLanguage('ru')).toBe('ru');
    expect(opportunityContentLanguage('kk-KZ')).toBe('kk-KZ');
    expect(opportunityContentLanguage('und')).toBe('und');
    expect(opportunityContentLanguage('')).toBe('und');
    expect(opportunityContentLanguage('<script>')).toBe('und');
    expect(opportunityContentLanguage('ru<script>')).toBe('und');
  });
});
