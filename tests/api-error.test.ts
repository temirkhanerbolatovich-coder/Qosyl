import { describe, expect, it } from 'vitest';
import { ApiError, isNotFoundError } from '../src/lib/api-error';

describe('platform error classification', () => {
  it('treats only a real 404 as closed or not public', () => {
    expect(isNotFoundError(new ApiError('Заказ не найден.', 404, 'NOT_FOUND'))).toBe(true);
    expect(isNotFoundError(new ApiError('Заказ не найден.', 404))).toBe(true);
  });

  it('keeps unavailable, forbidden and server errors retryable', () => {
    for (const status of [400, 401, 403, 409, 429, 500, 503]) {
      expect(isNotFoundError(new ApiError('Ошибка', status))).toBe(false);
    }
  });

  it('does not misread a plain error, a network failure or a message as not found', () => {
    expect(isNotFoundError(new Error('Заказ не найден'))).toBe(false);
    expect(isNotFoundError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isNotFoundError('404')).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });

  it('keeps the message, status and code of the response', () => {
    const error = new ApiError('Нет доступа', 403, 'FORBIDDEN');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Нет доступа');
    expect(error.status).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(new ApiError('x', 500).code).toBeNull();
  });
});
