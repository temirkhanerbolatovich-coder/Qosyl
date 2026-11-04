import { describe, expect, it } from 'vitest';
import {
  getProjectTemplatePatch,
  localizedProjectTemplates,
  projectTemplates,
  type ProjectTemplate,
  type ProjectTemplateField,
} from '../src/lib/project-templates';
import { specialtyLabels } from '../src/lib/opportunity-search';
import { projectFields } from '../src/lib/validation';

const normalizedFields = (template: ProjectTemplate) => ({
  ...template.fields,
  acceptanceCriteria: template.fields.acceptanceCriteria.split('\n'),
  skills: template.fields.skills.split(',').map((skill) => skill.trim()),
  estimatedHours: Number(template.fields.estimatedHours),
});

describe('bounded task templates', () => {
  it('provides complete Kazakh drafts without changing template identities or terms', () => {
    const translated = localizedProjectTemplates('kk');
    expect(localizedProjectTemplates('ru')).toEqual(projectTemplates);
    expect(translated.map((item) => item.id)).toEqual(projectTemplates.map((item) => item.id));
    for (const [index, template] of translated.entries()) {
      const original = projectTemplates[index];
      expect(template.specialty).toBe(original.specialty);
      expect(template.fields.category).toBe(original.fields.category);
      expect(template.fields.estimatedHours).toBe(original.fields.estimatedHours);
      expect(template.name).not.toBe(original.name);
      for (const field of [
        'title',
        'problem',
        'description',
        'deliverables',
        'acceptanceCriteria',
        'skills',
      ] as const) {
        expect(template.fields[field].trim()).not.toBe('');
        expect(template.fields[field]).not.toBe(original.fields[field]);
      }
      expect(
        projectFields.safeParse({
          ...normalizedFields(template),
          difficulty: 'beginner_friendly',
          mode: 'remote',
          city: '',
          locationPrivate: '',
          contactPrivate: 'owner@example.test',
          budgetKzt: 15000,
          dueAt: new Date(Date.now() + 30 * 86400000),
          preferredTime: '',
        }).success,
      ).toBe(true);
    }
  });
  it('preserves the original template identities and covers every existing specialty group', () => {
    expect(projectTemplates.map((template) => template.id)).toContain('spreadsheet');
    expect(projectTemplates.map((template) => template.id)).toContain('presentation');
    expect(new Set(projectTemplates.map((template) => template.id)).size).toBe(
      projectTemplates.length,
    );
    expect(new Set(projectTemplates.map((template) => template.specialty))).toEqual(
      new Set(Object.keys(specialtyLabels)),
    );
  });

  it.each(projectTemplates)(
    '$id produces a valid draft when the owner adds real terms',
    (template) => {
      const parsed = projectFields.parse({
        ...normalizedFields(template),
        difficulty: 'beginner_friendly',
        mode: 'remote',
        city: '',
        locationPrivate: '',
        contactPrivate: 'owner@example.test',
        budgetKzt: 15000,
        dueAt: new Date(Date.now() + 30 * 86400000),
        preferredTime: '',
      });
      expect(parsed.acceptanceCriteria.length).toBeGreaterThanOrEqual(3);
      expect(template.fields.title.length).toBeGreaterThanOrEqual(10);
      expect(template.fields.problem.length).toBeLessThanOrEqual(500);
      expect(template.fields.skills.length).toBeLessThanOrEqual(500);
      expect(projectFields.safeParse(normalizedFields(template)).success).toBe(false);
    },
  );

  it('fills whitespace blanks without replacing any authored values', () => {
    const spreadsheet = projectTemplates.find((template) => template.id === 'spreadsheet')!;
    const current = {
      title: 'Моё самостоятельно подготовленное название',
      category: 'analytics',
      estimatedHours: '12',
      description: '  \n  ',
    };
    const patch = getProjectTemplatePatch(spreadsheet, current);
    expect(patch).not.toHaveProperty('title');
    expect(patch).not.toHaveProperty('category');
    expect(patch).not.toHaveProperty('estimatedHours');
    expect(patch.description).toBe(spreadsheet.fields.description);
    expect(patch.deliverables).toBe(spreadsheet.fields.deliverables);
    expect(current).toEqual({
      title: 'Моё самостоятельно подготовленное название',
      category: 'analytics',
      estimatedHours: '12',
      description: '  \n  ',
    });
  });

  it('does nothing on repeated application or an already completed form', () => {
    const template = projectTemplates[0];
    const first = getProjectTemplatePatch(template, {});
    expect(first).toEqual(template.fields);
    expect(getProjectTemplatePatch(template, first)).toEqual({});
    const authored = Object.fromEntries(
      Object.keys(template.fields).map((field) => [field, 'Пользовательское значение']),
    ) as Record<ProjectTemplateField, string>;
    expect(getProjectTemplatePatch(template, authored)).toEqual({});
  });

  it('never provides budget, deadline, contacts, visibility or publication state', () => {
    const allowed = [
      'title',
      'category',
      'problem',
      'description',
      'deliverables',
      'acceptanceCriteria',
      'skills',
      'estimatedHours',
    ];
    for (const template of projectTemplates)
      expect(Object.keys(getProjectTemplatePatch(template, {})).sort()).toEqual(
        [...allowed].sort(),
      );
  });
});
