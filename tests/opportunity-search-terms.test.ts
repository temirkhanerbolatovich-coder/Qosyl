import { describe, expect, it } from 'vitest';
import {
  expandSearchTerms,
  matchesSearchTerm,
  opportunitySpecialties,
} from '../src/lib/opportunity-search';

describe('catalogue search synonyms', () => {
  it('connects internship wording across Russian, Kazakh and English', () => {
    for (const query of ['стажировка', 'Тағылымдама', 'internship', 'практика', 'стажир']) {
      const terms = expandSearchTerms(query);
      expect(terms).toEqual(expect.arrayContaining(['стажиров', 'тағылымдам', 'internship']));
      expect(terms[0]).toBe(query.toLowerCase());
    }
  });

  it('maps design and development wording to its group', () => {
    expect(expandSearchTerms('дизайн')).toContain('design');
    expect(expandSearchTerms('UI/UX')).toEqual(expect.arrayContaining(['ui/ux', 'дизайн']));
    expect(expandSearchTerms('разработка')).toContain('software');
  });

  it('keeps unrelated and look-alike words exact', () => {
    expect(expandSearchTerms('международный')).toEqual(['международный']);
    // "программа" is a programme, not programming.
    expect(expandSearchTerms('программа')).toEqual(['программа']);
    expect(expandSearchTerms('international')).toEqual(['international']);
    expect(expandSearchTerms('ab')).toEqual(['ab']);
  });

  it('matches stems by prefix or by a short ending only', () => {
    expect(matchesSearchTerm('стажир', 'стажиров')).toBe(true);
    expect(matchesSearchTerm('стажировками', 'стажиров')).toBe(true);
    expect(matchesSearchTerm('стажировочный', 'стажиров')).toBe(false);
    expect(matchesSearchTerm('ст', 'стажиров')).toBe(false);
  });
});

describe('direction keywords', () => {
  it('finds directions by stems in any of the languages', () => {
    expect(opportunitySpecialties('Курс для педагогов')).toContain('education');
    expect(opportunitySpecialties('Бағдарламалау курсы')).toContain('it');
    expect(opportunitySpecialties('Medicine and health scholarship')).toContain('health');
    expect(opportunitySpecialties('Общее описание')).toEqual([]);
  });
});
