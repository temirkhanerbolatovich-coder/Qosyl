import { describe, expect, it } from 'vitest';
import { kazakhValidationMessage } from '../src/lib/validation-feedback';
import { mutationSchemas } from '../src/lib/validation';

describe('bounded Zod feedback translation', () => {
  it('handles real enum, array and indexed-item errors', () => {
    const cases = [
      ['category', mutationSchemas.createProject.shape.category.safeParse('unknown'), 'Санатты'],
      ['mode', mutationSchemas.createProject.shape.mode.safeParse('unknown'), 'Жұмыс форматын'],
      [
        'difficulty',
        mutationSchemas.createProject.shape.difficulty.safeParse('unknown'),
        'Деңгейді',
      ],
      [
        'acceptanceCriteria',
        mutationSchemas.createProject.shape.acceptanceCriteria.safeParse([]),
        'Кемінде 1 элемент',
      ],
      [
        'acceptanceCriteria',
        mutationSchemas.createProject.shape.acceptanceCriteria.safeParse(['x']),
        'Қабылдау өлшемдері (1): Кемінде 3',
      ],
      [
        'skills',
        mutationSchemas.createProject.shape.skills.safeParse(Array(16).fill('a')),
        'Ең көбі 15 элемент',
      ],
    ] as const;
    for (const [field, result, expected] of cases) {
      if (result.success) throw new Error(`Expected invalid ${field}`);
      const issue = result.error.issues[0];
      const path = [field, ...issue.path].join('.');
      expect(kazakhValidationMessage(`${path}: ${issue.message}`)).toContain(expected);
    }
  });
  it('handles a real project title validation issue', () => {
    const result = mutationSchemas.createProject.shape.title.safeParse('x');
    if (result.success) throw new Error('Expected a rejected title');
    const message = `title: ${result.error.issues[0].message}`;
    expect(kazakhValidationMessage(message)).toContain('Тапсырма атауы: Кемінде');
  });
  it('translates known fields and exact numeric limits', () => {
    expect(
      kazakhValidationMessage(
        'title: Слишком маленькое значение: ожидалось, что string будет иметь >=8 символов; budgetKzt: Слишком маленькое значение: ожидалось, что number будет >=1',
      ),
    ).toBe('Тапсырма атауы: Кемінде 8 таңба енгізіңіз; Бюджет: Мән кемінде 1 болуы керек');
  });
  it('never guesses or loses unknown messages and dynamic details', () => {
    for (const text of [
      'unknown: Неверный ввод: ожидалось string, получено undefined',
      'title: личный комментарий',
      'title: Неверный ввод: ожидалось string, получено undefined; unknown: секрет',
      'constructor: Неверный ввод: ожидалось string, получено undefined',
      'title.0: Слишком маленькое значение: ожидалось, что string будет иметь >=3 символа',
      'category: Неверный вариант: ожидалось одно из "private-user-data"',
    ])
      expect(kazakhValidationMessage(text)).toBeNull();
  });
});
