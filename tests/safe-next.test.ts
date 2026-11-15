import { describe, expect, it } from 'vitest';
import {
  authPath,
  DEFAULT_NEXT,
  onboardingPath,
  parseNext,
  roleForNext,
  safeNext,
} from '../src/lib/safe-next';

describe('safe return address', () => {
  it('keeps an ordinary page of this site with its query', () => {
    expect(safeNext('/projects/abc123')).toBe('/projects/abc123');
    expect(safeNext('/projects/abc123?apply=1')).toBe('/projects/abc123?apply=1');
    expect(safeNext('/opportunities?category=grant&q=design')).toBe(
      '/opportunities?category=grant&q=design',
    );
    expect(safeNext('/projects/abc123?apply=1#form')).toBe('/projects/abc123?apply=1#form');
  });

  it.each([
    'https://evil.example',
    'http://evil.example/projects/1',
    '//evil.example',
    '//evil.example/projects/1',
    '/\\evil.example',
    '\\\\evil.example',
    '/projects\\@evil.example',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'evil.example/projects',
    'projects/abc',
    '%2F%2Fevil.example',
    '/redirect?to=https://evil.example',
    '/\tevil.example',
    '/\nevil.example',
    '/ evil.example',
    '/%0d%0aevil',
    '/proj\u0000ects',
    '',
  ])('falls back for the unsafe value %j', (value) => {
    expect(safeNext(value)).toBe(DEFAULT_NEXT);
    expect(parseNext(value) === null || parseNext(value)!.startsWith('/')).toBe(true);
  });

  it('never returns an address that leaves the site', () => {
    const values = [
      '/a/../../evil',
      '/%2e%2e/%2e%2e/evil',
      '/projects/..//evil.example',
      '/.//evil.example',
      '/projects/%2F%2Fevil.example',
    ];
    for (const value of values) {
      const result = safeNext(value);
      expect(result.startsWith('/')).toBe(true);
      expect(result.startsWith('//')).toBe(false);
      expect(new URL(result, 'http://qosyl.invalid').origin).toBe('http://qosyl.invalid');
    }
  });

  it('rejects non-strings, over-long values and loops back into sign-in or the API', () => {
    for (const value of [undefined, null, 42, {}, ['/projects/1'], true]) {
      expect(safeNext(value)).toBe(DEFAULT_NEXT);
    }
    expect(safeNext('/' + 'a'.repeat(600))).toBe(DEFAULT_NEXT);
    for (const value of ['/auth/login', '/auth/register?x=1', '/auth', '/api/platform?view=me']) {
      expect(safeNext(value)).toBe(DEFAULT_NEXT);
    }
    expect(safeNext('/authors')).toBe('/authors');
    expect(safeNext('/apis')).toBe('/apis');
  });

  it('uses a custom fallback', () => {
    expect(safeNext('https://evil.example', '/onboarding')).toBe('/onboarding');
    expect(safeNext(undefined, '')).toBe('');
  });
});

describe('role and addresses for the remembered page', () => {
  it('picks the role from the page the person was heading to', () => {
    expect(roleForNext('/projects/abc?apply=1')).toBe('student');
    expect(roleForNext('/projects')).toBe('student');
    expect(roleForNext('/client/projects/new')).toBe('client');
    expect(roleForNext('/opportunities')).toBeNull();
    expect(roleForNext('/projectsx')).toBeNull();
    expect(roleForNext(null)).toBeNull();
    expect(roleForNext(undefined)).toBeNull();
  });

  it('builds sign-in and sign-up addresses that carry only a safe return address', () => {
    expect(authPath('/auth/register', '/projects/abc?apply=1')).toBe(
      '/auth/register?next=%2Fprojects%2Fabc%3Fapply%3D1',
    );
    expect(authPath('/auth/login', 'https://evil.example')).toBe('/auth/login');
    expect(authPath('/auth/login', null)).toBe('/auth/login');
  });

  it('builds the onboarding address that continues to the remembered page', () => {
    expect(onboardingPath('/projects/abc?apply=1')).toBe(
      '/onboarding?role=student&next=%2Fprojects%2Fabc%3Fapply%3D1',
    );
    expect(onboardingPath('/client/projects/new')).toBe(
      '/onboarding?role=client&next=%2Fclient%2Fprojects%2Fnew',
    );
    expect(onboardingPath('/opportunities')).toBe('/onboarding?next=%2Fopportunities');
    expect(onboardingPath('//evil.example')).toBe('/onboarding');
    expect(onboardingPath(undefined)).toBe('/onboarding');
  });
});
