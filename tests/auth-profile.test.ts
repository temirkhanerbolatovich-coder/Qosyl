import { describe, expect, it } from 'vitest';
import { profileInput, safePortfolioUrl } from '../src/app/api/profile/schema';

describe('profile permissions and validation', () => {
  const student = { role: 'student', name: 'Тестовый участник', city: 'Семей' };

  it('allows a newcomer without completed work', () => {
    expect(profileInput.safeParse(student).success).toBe(true);
  });

  it('never accepts administrative roles or verification flags from the form', () => {
    expect(profileInput.safeParse({ ...student, role: 'admin' }).success).toBe(false);
    expect(profileInput.safeParse({ ...student, roles: ['admin'] }).success).toBe(false);
    expect(profileInput.safeParse({ ...student, verificationStatus: 'verified' }).success).toBe(
      false,
    );
  });

  it('rejects impossible availability and empty working formats', () => {
    expect(profileInput.safeParse({ ...student, weeklyHours: 0 }).success).toBe(false);
    expect(profileInput.safeParse({ ...student, weeklyHours: 41 }).success).toBe(false);
    expect(profileInput.safeParse({ ...student, formats: [] }).success).toBe(false);
  });

  it('rejects script links, embedded credentials and insecure portfolio links', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>',
      'http://example.com',
      'https://secret:token@example.com/',
    ]) {
      expect(safePortfolioUrl.safeParse(url).success).toBe(false);
    }
    expect(safePortfolioUrl.safeParse('https://github.com/example/work').success).toBe(true);
  });

  it('limits public external work collection', () => {
    expect(
      profileInput.safeParse({
        ...student,
        externalWorks: Array.from({ length: 11 }, () => ({
          title: 'Работа',
          description: '',
          url: 'https://example.com',
        })),
      }).success,
    ).toBe(false);
  });
});
