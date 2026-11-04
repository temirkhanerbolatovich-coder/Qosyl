import { describe, expect, it } from 'vitest';
import {
  profileFailureCopy,
  profileFailureFromResponse,
  type ProfileFailure,
} from '../src/lib/profile-localization';

describe('profile feedback language', () => {
  it('re-renders a stable validation failure in either language while retaining server detail', () => {
    const failure = profileFailureFromResponse(400, {
      code: 'VALIDATION_ERROR',
      error: 'Проверьте имя, город, ссылки и остальные поля профиля.',
      fields: { city: ['Минимум два символа.'] },
    });
    expect(profileFailureCopy(failure, 'ru')).toEqual({
      summary: 'Проверьте имя, город, ссылки и остальные поля профиля.',
      original: '',
    });
    expect(profileFailureCopy(failure, 'kk')).toEqual({
      summary: 'Аты-жөніңізді, қаланы, сілтемелерді және профильдің басқа өрістерін тексеріңіз.',
      original: 'Проверьте имя, город, ссылки и остальные поля профиля.',
    });
    expect(failure).toEqual({
      kind: 'response',
      status: 400,
      code: 'VALIDATION_ERROR',
      original: 'Проверьте имя, город, ссылки и остальные поля профиля.',
    });
  });

  it('keeps specific permission and unknown server messages without guessing a translation', () => {
    const denied = profileFailureFromResponse(403, {
      code: 'FORBIDDEN',
      error: 'Аккаунт недоступен.',
    });
    expect(profileFailureCopy(denied, 'kk')).toEqual({
      summary: 'Профильді сақтауға рұқсат жоқ. Аккаунтты тексеріп, бетті жаңартыңыз.',
      original: 'Аккаунт недоступен.',
    });
    const unknown = profileFailureFromResponse(422, {
      code: 'NEW_UPSTREAM_CODE',
      error: 'Original service detail remains unchanged.',
    });
    expect(profileFailureCopy(unknown, 'kk').original).toBe(
      'Original service detail remains unchanged.',
    );
    expect(profileFailureCopy(unknown, 'ru').original).toBe(
      'Original service detail remains unchanged.',
    );
    expect(profileFailureCopy(unknown, 'kk').summary).toContain('бастапқы хабарламасын');
  });

  it('does not treat an inconsistent code/status or malformed response as a known failure', () => {
    const inconsistent = profileFailureFromResponse(500, {
      code: 'UNAUTHENTICATED',
      error: 'Specific failure with inconsistent metadata.',
    });
    expect(profileFailureCopy(inconsistent, 'kk').summary).not.toBe('Аккаунтқа кіріңіз.');
    expect(profileFailureCopy(inconsistent, 'kk').original).toBe(
      'Specific failure with inconsistent metadata.',
    );
    for (const response of [null, undefined, 'invalid JSON body', { code: [], error: {} }]) {
      expect(profileFailureFromResponse(503, response)).toEqual({
        kind: 'response',
        status: 503,
        code: '',
        original: '',
      });
    }
  });

  it('switches a network failure immediately without inventing a server response', () => {
    const failure: ProfileFailure = { kind: 'network' };
    expect(profileFailureCopy(failure, 'ru').summary).toContain('Сервер недоступен');
    expect(profileFailureCopy(failure, 'kk').summary).toContain('Сервер қолжетімсіз');
    expect(profileFailureCopy(failure, 'kk').original).toBe('');
    expect(failure).toEqual({ kind: 'network' });
  });
});
