import { describe, expect, it } from 'vitest';
import { authMailCopy, authMailLocale } from '../src/lib/auth-mail-copy';

describe('authentication mail language', () => {
  it('selects only a supported request cookie and defaults safely', () => {
    expect(authMailLocale()).toBe('ru');
    expect(
      authMailLocale(
        new Request('https://example.test', { headers: { cookie: 'x=1; qosyl-locale=kk' } }),
      ),
    ).toBe('kk');
    expect(
      authMailLocale(
        new Request('https://example.test', { headers: { cookie: 'qosyl-locale=unknown' } }),
      ),
    ).toBe('ru');
  });
  it.each(['ru', 'kk'] as const)('preserves the exact link and expiry in %s', (locale) => {
    const url = 'https://example.test/reset?token=synthetic-test';
    const reset = authMailCopy('reset', locale, 'Qosyl', url);
    const verification = authMailCopy('verification', locale, 'Qosyl', url);
    expect(reset.text).toContain(url);
    expect(reset.text).toContain('30');
    expect(verification.text).toContain(url);
    expect(verification.text).toMatch(locale === 'kk' ? /бір сағат/ : /один час/);
    expect(reset.subject).toContain('Qosyl');
  });
});
