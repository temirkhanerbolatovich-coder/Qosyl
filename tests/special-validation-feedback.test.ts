import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { mutationSchemas } from '../src/lib/validation';
import { leadCreateInput, leadConversionInput } from '../src/lib/lead-validation';
import { sourceInput, manualContentInput, contentReviewInput } from '../src/lib/content-validation';
import { catalogQuerySchema } from '../src/lib/catalog-query';
import { recordPilotCostInput } from '../src/lib/pilot-cost-validation';
import { kazakhValidationMessage } from '../src/lib/validation-feedback';
import { marketplaceCopy } from '../src/lib/marketplace-copy';

function wireError(schema: z.ZodType, input: unknown, prefix = '') {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('Expected rejected input');
  return result.error.issues
    .map(
      (issue) => `${(prefix ? [prefix, ...issue.path] : issue.path).join('.')}: ${issue.message}`,
    )
    .join('; ');
}
const source = {
  name: 'Синтетический источник',
  type: 'manual',
  allowedHost: 'example.org',
  rightsNote: 'Синтетическое право на тестовый материал.',
};
const delivery = {
  projectId: 'synthetic',
  notes: 'Синтетическое пояснение результата.',
  links: [],
  attachmentIds: [],
};
const cost = {
  idempotencyKey: 'fbc05289-047e-48b0-9c19-e56972c114bd',
  kind: 'support',
  occurredAt: '2000-01-01T00:00:00Z',
  minutes: 0,
  amountKzt: 0,
  description: 'Синтетическая запись.',
};

describe('exact special-rule localization from real validation schemas', () => {
  it.each([
    [
      'project deadline',
      mutationSchemas.createProject.shape.dueAt,
      '2000-01-01',
      'dueAt',
      'Болашақ күнді',
    ],
    [
      'nested project deadline',
      mutationSchemas.createProject.shape.dueAt,
      '2000-01-01',
      'project.dueAt',
      'Тапсырма мерзімі',
    ],
    [
      'delivery HTTPS',
      mutationSchemas.applyToProject.shape.links,
      ['http://example.org/result'],
      'links',
      'Сілтемелер (1): Логин',
    ],
    [
      'portfolio HTTPS',
      mutationSchemas.setPortfolio.shape.publicLinks,
      ['https://name:pass@example.org/result'],
      'publicLinks',
      'Жария сілтемелер (1): Логин',
    ],
    [
      'private delivery link',
      mutationSchemas.submitDeliverable.shape.links,
      ['https://example.org/api/attachments/synthetic'],
      'links',
      'тапсыру тарихында',
    ],
    [
      'private portfolio link',
      mutationSchemas.setPortfolio.shape.publicLinks,
      ['https://example.org/api/attachments/synthetic'],
      'publicLinks',
      'жариялауға болмайды',
    ],
    ['delivery count', mutationSchemas.submitDeliverable, delivery, '', '1–5 нәтиже'],
    [
      'delivery duplicates',
      mutationSchemas.submitDeliverable,
      { ...delivery, attachmentIds: ['same', 'same'] },
      '',
      'файлды қайталамаңыз',
    ],
    [
      'complaint target',
      mutationSchemas.fileComplaint,
      { reason: 'Синтетическая причина жалобы.' },
      '',
      'Шағым нысанын',
    ],
    [
      'lead expiry',
      leadCreateInput.shape.expiresAt,
      '2000-01-01T00:00:00Z',
      'expiresAt',
      'Алдағы 90 күн',
    ],
    [
      'lead HTTPS',
      leadCreateInput.shape.sourceUrl,
      'http://example.org/request',
      'sourceUrl',
      'Дереккөз сілтемесі',
    ],
    [
      'handoff consent false',
      leadConversionInput.shape.confirmation,
      false,
      'confirmation',
      'Келісім:',
    ],
    [
      'handoff consent missing',
      leadConversionInput.shape.confirmation,
      undefined,
      'confirmation',
      'Келісім:',
    ],
    [
      'manual content HTTPS',
      manualContentInput.shape.url,
      'https://example.org:444/path#fragment',
      'url',
      'фрагментсіз',
    ],
    [
      'feed HTTPS',
      sourceInput.shape.feedUrl,
      'http://example.org/feed',
      'feedUrl',
      'Жүктеу сілтемесі',
    ],
    [
      'terms HTTPS',
      sourceInput.shape.termsUrl,
      'http://example.org/terms',
      'termsUrl',
      'Шарттар сілтемесі',
    ],
    ['missing feed', sourceInput, { ...source, type: 'rss' }, '', 'Автоматты дереккөз'],
    [
      'manual source with feed',
      sourceInput,
      { ...source, feedUrl: 'https://example.org/feed' },
      '',
      'желіден жүктелмейді',
    ],
    [
      'source domain mismatch',
      sourceInput,
      { ...source, type: 'rss', feedUrl: 'https://other.org/feed' },
      '',
      'дәл сәйкес',
    ],
    [
      'publication expiry',
      contentReviewInput,
      {
        itemId: 'synthetic',
        expectedRevisionId: 'synthetic',
        expectedUpdatedAt: '2000-01-01T00:00:00Z',
        decision: 'publish',
        reason: 'Синтетическая проверка.',
      },
      '',
      'Жарияланымның',
    ],
    [
      'cost future date',
      recordPilotCostInput.shape.occurredAt,
      '2100-01-01T00:00:00Z',
      'occurredAt',
      'Шығын күні',
    ],
    ['cost amount or time', recordPilotCostInput, cost, '', 'Жұмсалған уақытты'],
    ['catalog date', catalogQuerySchema, { dueBefore: '2026-02-30' }, '', 'Мерзім сүзгісі'],
    [
      'catalog budget range',
      catalogQuerySchema,
      { minBudget: 5000, maxBudget: 1000 },
      '',
      'Ең төменгі бюджеттен',
    ],
  ] as const)(
    '%s preserves the path and translates the known reason',
    (_name, schema, input, prefix, expected) => {
      const message = wireError(schema, input, prefix);
      expect(kazakhValidationMessage(message), message).toContain(expected);
    },
  );

  it('translates onsite-city rules on only the two actual paths', () => {
    const fields = {
      title: 'Синтетический заказ',
      category: 'writing',
      problem: 'Синтетическая проблема.',
      description: 'Синтетическое описание для проверки.',
      deliverables: 'Синтетический результат.',
      acceptanceCriteria: ['Результат подготовлен.'],
      difficulty: 'beginner_friendly',
      mode: 'onsite',
      budgetKzt: 5000,
      estimatedHours: 1,
      dueAt: '2100-01-01',
      city: '',
    };
    for (const prefix of ['', 'project'])
      expect(
        kazakhValidationMessage(wireError(mutationSchemas.createProject, fields, prefix)),
      ).toContain('Офлайн жұмыс');
  });
  it('translates both role branches while retaining unknown and user-authored details', () => {
    expect(marketplaceCopy('Выберите действующего администратора.', 'kk')).toBe(
      'Белсенді әкімшіні таңдаңыз.',
    );
    expect(marketplaceCopy('Выберите действующего заказчика.', 'kk')).toBe(
      'Белсенді тапсырыс берушіні таңдаңыз.',
    );
    expect(
      marketplaceCopy('Выберите действующего администратора. Причина пользователя', 'kk'),
    ).toBe('Выберите действующего администратора. Причина пользователя');
  });
  it('translates a whole known combination and rejects any unknown part without dropping it', () => {
    const date = 'dueAt: Срок должен быть в будущем.';
    const url = 'links.0: Используйте HTTPS-ссылку без логина и пароля.';
    expect(kazakhValidationMessage(`${date}; ${url}`)).toContain('Болашақ күнді');
    expect(kazakhValidationMessage(`${date}; ${url}`)).toContain('Сілтемелер (1)');
    for (const value of [
      `${date}; unknown: личная причина`,
      `${date} Причина пользователя`,
      'reason: Срок должен быть в будущем.',
      'unknown.dueAt: Срок должен быть в будущем.',
      'links.1000: Используйте HTTPS-ссылку без логина и пароля.',
      'links.0: Используйте HTTPS-ссылку без логина и пароля. чужой текст',
      'confirmation: Неверный ввод: ожидалось false',
      'project.project.dueAt: Срок должен быть в будущем.',
      'constructor: Срок должен быть в будущем.',
      'dueAt: Срок должен быть в будущем.; '.repeat(31),
      'dueAt: ' + 'x'.repeat(4000),
    ])
      expect(kazakhValidationMessage(value), value).toBeNull();
  });
});
