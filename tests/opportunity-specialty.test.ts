import { describe, it, expect } from 'vitest';
import { specialtyTerms } from '../src/lib/opportunity-search';
const matches = (text: string, key: keyof typeof specialtyTerms) =>
  specialtyTerms[key].some((term) => text.toLowerCase().includes(term));
describe('opportunity specialty false-positive regressions', () => {
  it('does not classify academic programmes as programming', () =>
    expect(matches('Программа академической мобильности', 'it')).toBe(false));
  it('retains programming and software opportunities', () => {
    expect(matches('Конкурс программистов', 'it')).toBe(true);
    expect(matches('Программное обеспечение для студентов', 'it')).toBe(true);
  });
  it('does not classify artificial intelligence as fine art', () => {
    expect(matches('Искусственный интеллект', 'humanities')).toBe(false);
    expect(matches('Искусственный интеллект', 'it')).toBe(true);
  });
  it('retains arts opportunities', () =>
    expect(matches('Академия искусств приглашает на конкурс', 'humanities')).toBe(true));
});
