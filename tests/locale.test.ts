import { describe, expect, it } from 'vitest';
import {
  localeCookieAssignment,
  localeCookieMaxAge,
  localeFromCookieHeader,
  parseLocale,
} from '../src/lib/locale';
import { categoryLabels, modeLabels, statusLabels, date, money } from '../src/lib/labels';
import {
  localizedCategoryLabels,
  localizedModeLabels,
  localizedStatusLabels,
} from '../src/lib/localized-labels';

describe('display language preference', () => {
  it('uses the existing Russian default and accepts only the two supported identifiers', () => {
    expect(parseLocale('kk')).toBe('kk');
    expect(parseLocale('ru')).toBe('ru');
    for (const value of [undefined, null, 'kz', 'KK', 'kk-KZ', 'en', 'kk; Path=/api', {}, ['kk']])
      expect(parseLocale(value)).toBe('ru');
  });
  it('reads one exact display cookie without treating other cookie values as preferences', () => {
    expect(localeFromCookieHeader('auth=opaque; qosyl-locale=kk; other=ru')).toBe('kk');
    expect(localeFromCookieHeader('qosyl-locale=ru')).toBe('ru');
    for (const header of [
      '',
      'other-qosyl-locale=kk',
      'qosyl-locale=unsupported',
      'qosyl-locale=kk%3Bpath%3D%2F',
      'qosyl-locale=KK',
    ])
      expect(localeFromCookieHeader(header)).toBeNull();
  });
  it('scopes a bounded non-secret cookie to all routes with HTTPS security when applicable', () => {
    expect(localeCookieMaxAge).toBe(31536000);
    expect(localeCookieAssignment('kk', false)).toBe(
      'qosyl-locale=kk; Path=/; Max-Age=31536000; SameSite=Lax',
    );
    expect(localeCookieAssignment('kk', true)).toMatch(/; Secure$/);
    expect(localeCookieAssignment('kk; Domain=evil.example', false)).toBe(
      localeCookieAssignment('ru', false),
    );
    expect(localeCookieAssignment('ru', false)).not.toContain('HttpOnly');
  });
  it('keeps every persisted category, mode and status identifier in both label sets', () => {
    for (const [base, localized] of [
      [categoryLabels, localizedCategoryLabels],
      [modeLabels, localizedModeLabels],
      [statusLabels, localizedStatusLabels],
    ] as const) {
      expect(localized('ru')).toEqual(base);
      expect(Object.keys(localized('kk')).sort()).toEqual(Object.keys(base).sort());
      expect(Object.values(localized('kk')).every((label) => label.trim().length > 0)).toBe(true);
    }
    expect(localizedStatusLabels('kk').disputed).not.toBe(statusLabels.disputed);
    expect(localizedStatusLabels('ru').disputed).toBe(statusLabels.disputed);
  });
  it('changes display formatting without changing the stored instant or Russian callers', () => {
    const value = new Date('2026-10-27T23:30:00.000Z');
    expect(date(value, true)).toBe(date(value, true, 'ru'));
    expect(date(value, true, 'kk')).toContain('28');
    expect(date(value, true, 'kk')).toContain('04:30');
    expect(date(value, true, 'kk')).not.toBe(date(value, true, 'ru'));
    expect(value.toISOString()).toBe('2026-10-27T23:30:00.000Z');
    expect(money(15000)).toBe(money(15000, 'ru'));
    expect(money(15000, 'kk')).toContain('₸');
    expect(date(null, false, 'kk')).toBe('—');
    expect(date('not-a-date', false, 'kk')).toBe('—');
  });
  it('shows unambiguous numeric Kazakh dates, including the local day at UTC boundaries', () => {
    expect(date('2026-11-10T00:00:00.000Z', false, 'kk')).toBe('10.11.2026');
    expect(date('2026-10-27T23:30:00.000Z', false, 'kk')).toBe('28.10.2026');
  });
});
