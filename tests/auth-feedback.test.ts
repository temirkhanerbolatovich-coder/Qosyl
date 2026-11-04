import { describe, expect, it } from 'vitest';
import { authFeedbackText, authMessage, type AuthFeedback } from '../src/lib/auth-feedback';

describe('authentication feedback localization', () => {
  it('retranslates the same feedback without changing its identity', () => {
    const error: AuthFeedback = {
      kind: 'response',
      status: 401,
      code: 'INVALID_EMAIL_OR_PASSWORD',
    };
    expect(authFeedbackText(error, 'ru').text).toBe('Неверный email или пароль.');
    expect(authFeedbackText(error, 'kk')).toEqual({
      text: 'Email немесе құпиясөз қате.',
      language: 'kk',
      original: false,
    });
    expect(error).toEqual({ kind: 'response', status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' });
  });
  it('prioritizes rate and service failures over returned internal messages', () => {
    for (const status of [429, 500, 503]) {
      const error: AuthFeedback = { kind: 'response', status, message: 'private internal detail' };
      expect(authFeedbackText(error, 'kk').text).not.toContain('private');
      expect(authFeedbackText(error, 'kk').language).toBe('kk');
    }
    expect(authFeedbackText({ kind: 'response', status: 429 }, 'ru').text).toContain('минуту');
  });
  it('preserves unknown explanations, including moderator reasons, without claiming a translation', () => {
    const message = 'Аккаунт приостановлен. Причина модератора: тексеру қажет.';
    expect(
      authFeedbackText({ kind: 'response', status: 403, code: 'FORBIDDEN', message }, 'kk'),
    ).toEqual({ text: message, language: 'und', original: true });
    for (const code of ['toString', '__proto__', 'constructor'])
      expect(
        authFeedbackText({ kind: 'response', status: 400, code, message: 'Original' }, 'kk'),
      ).toEqual({ text: 'Original', language: 'und', original: true });
  });
  it('translates known consent errors and safe fallback while preserving email enumeration wording', () => {
    expect(
      authFeedbackText(
        {
          kind: 'response',
          status: 400,
          message:
            'Для участия в пилоте подтвердите возраст 18+ и согласие с условиями обработки данных.',
        },
        'kk',
      ).text,
    ).toContain('18');
    expect(authFeedbackText({ kind: 'response', status: 400 }, 'kk').language).toBe('kk');
    expect(authMessage('emailRequested', 'ru')).toMatch(/^Если/);
    expect(authMessage('emailRequested', 'kk')).toContain('қолжетімді болса');
    expect(authMessage('passwordChanged', 'kk')).toContain('өзгертілді');
  });
});
