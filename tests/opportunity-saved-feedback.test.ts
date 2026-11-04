import { describe, expect, it } from 'vitest';
import { savedServerFeedback } from '../src/lib/opportunity-saved-feedback';

describe('saved opportunities server feedback', () => {
  it('translates fixed limits and keeps the Russian response unchanged', () => {
    const text = 'Можно сохранить до 20 поисков. Удалите ненужный поиск.';
    expect(savedServerFeedback(text, 'kk')).toEqual({
      text: '20 іздеуге дейін сақтауға болады. Қажетсіз іздеуді жойыңыз.',
      language: 'kk',
      original: false,
    });
    expect(savedServerFeedback(text, 'ru')).toEqual({ text, language: 'ru', original: false });
  });
  it('retains unrecognized content including object prototype names', () => {
    for (const text of ['constructor', '__proto__', 'Причина: личный текст'])
      expect(savedServerFeedback(text, 'kk')).toEqual({ text, language: 'und', original: true });
  });
});
