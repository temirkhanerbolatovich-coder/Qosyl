import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';
import { parseThemePreference, resolveTheme, themeBootstrap } from '../src/lib/theme';

describe('theme preference and pre-paint initialization', () => {
  it.each(['light', 'dark', 'system', null, '<script>bad()</script>'])(
    'validates stored %s',
    (value) => {
      expect(parseThemePreference(value)).toBe(
        value === 'light' || value === 'dark' ? value : 'system',
      );
    },
  );
  it.each([
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
  ] as const)('resolves %s independently of app data', (preference, systemDark, expected) => {
    expect(resolveTheme(preference, systemDark)).toBe(expected);
  });
  it.each([
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['system', true, 'dark'],
    ['invalid', false, 'light'],
  ] as const)('sets the first-paint theme for %s', (stored, systemDark, expected) => {
    const dataset: Record<string, string> = {};
    runInNewContext(themeBootstrap, {
      document: { documentElement: { dataset } },
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: systemDark }),
    });
    expect(dataset.theme).toBe(expected);
    expect(dataset.themePreference).toBe(parseThemePreference(stored));
  });
  it('keeps system preference usable when localStorage is blocked', () => {
    const dataset: Record<string, string> = {};
    runInNewContext(themeBootstrap, {
      document: { documentElement: { dataset } },
      localStorage: {
        getItem: () => {
          throw Error('Blocked');
        },
      },
      matchMedia: () => ({ matches: true }),
    });
    expect(dataset).toEqual({ themePreference: 'system', theme: 'dark' });
  });
});
