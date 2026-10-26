import { describe, it, expect } from 'vitest';
import { requireState, requireRole, isParticipant } from '../src/lib/permissions';
import { mutationSchemas, projectFields, safeUrl } from '../src/lib/validation';

const project = {
  title: 'Тестовый проект',
  category: 'design',
  problem: 'Нужно оформить понятное меню',
  description: 'Подготовить согласованный макет меню на двух страницах',
  deliverables: 'PDF и редактируемый исходник',
  acceptanceCriteria: ['Две страницы меню'],
  skills: ['Дизайн'],
  difficulty: 'beginner_friendly',
  mode: 'remote',
  budgetKzt: 8000,
  estimatedHours: 4,
  dueAt: new Date(Date.now() + 86400000).toISOString(),
};
describe('Server input and permissions', () => {
  it('requires explicit result, criteria, budget and future deadline', () => {
    expect(projectFields.safeParse(project).success).toBe(true);
    for (const invalid of [
      { budgetKzt: 0 },
      { budgetKzt: -1 },
      { acceptanceCriteria: [] },
      { deliverables: '' },
      { dueAt: '2020-01-01' },
    ])
      expect(projectFields.safeParse({ ...project, ...invalid }).success).toBe(false);
  });
  it('requires an approximate city for onsite work', () => {
    expect(projectFields.safeParse({ ...project, mode: 'onsite' }).success).toBe(false);
    expect(
      projectFields.safeParse({ ...project, mode: 'onsite', city: 'Усть-Каменогорск' }).success,
    ).toBe(true);
  });
  it('allows only HTTPS links with no credentials', () => {
    for (const url of [
      'javascript:alert(1)',
      'http://example.com',
      'data:text/html,a',
      'https://user:secret@example.com',
    ])
      expect(safeUrl.safeParse(url).success).toBe(false);
    expect(safeUrl.safeParse('https://example.com/result').success).toBe(true);
  });
  it('requires exact version identity for consent', () => {
    expect(mutationSchemas.approveAgreement.safeParse({ projectId: 'p' }).success).toBe(false);
    expect(mutationSchemas.consentPortfolio.safeParse({ projectId: 'p' }).success).toBe(false);
  });
  it('requires criterion references for revisions and meaningful comments', () => {
    expect(
      mutationSchemas.requestChanges.safeParse({
        projectId: 'p',
        submissionId: 's',
        notes: 'Нужна правка пункта',
        criteriaIndexes: [],
      }).success,
    ).toBe(false);
    expect(
      mutationSchemas.requestChanges.safeParse({
        projectId: 'p',
        submissionId: 's',
        notes: 'Нужна правка пункта',
        criteriaIndexes: [0],
      }).success,
    ).toBe(true);
  });
  it('does not grant participant access to unrelated users', () => {
    expect(isParticipant({ clientId: 'c', assignedStudentId: 's' }, 's')).toBe(true);
    expect(isParticipant({ clientId: 'c', assignedStudentId: 's' }, 'other')).toBe(false);
    expect(() => requireRole(['student'], 'admin')).toThrow();
    expect(() => requireState('in_progress', ['submitted'])).toThrow();
    expect(() => requireState('submitted', ['submitted'])).not.toThrow();
  });
});
