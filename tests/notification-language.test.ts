import { describe, expect, it } from 'vitest';
import {
  lifecycleNotificationText,
  notificationLanguageInput,
  notificationText,
  opportunityNotificationText,
} from '../src/lib/notification-language';

describe('recipient notification language', () => {
  it('accepts only a language and never an account id', () => {
    expect(notificationLanguageInput.safeParse({ language: 'kk' }).success).toBe(true);
    expect(notificationLanguageInput.safeParse({ language: 'en' }).success).toBe(false);
    expect(
      notificationLanguageInput.safeParse({ language: 'kk', userId: 'someone-else' }).success,
    ).toBe(false);
  });
  it('translates system text without altering user-authored reasons', () => {
    const reason = 'Нужны уточнения: дизайн «пример»';
    expect(notificationText('kk', `Заказ возвращен: ${reason}`)).toBe(
      `Тапсырыс қайтарылды: ${reason}`,
    );
    expect(notificationText('ru', `Заказ возвращен: ${reason}`)).toBe(`Заказ возвращен: ${reason}`);
    expect(notificationText('kk', 'Непредусмотренное сообщение')).toBe(
      'Непредусмотренное сообщение',
    );
  });
  it('keeps titles, time boundaries and count intact in background notifications', () => {
    const title = 'Жоба «A» / пример';
    const future = lifecycleNotificationText(
      'kk',
      'execution',
      title,
      'До согласованного срока задания',
    );
    const expired = lifecycleNotificationText(
      'kk',
      'execution',
      title,
      'Согласованный срок задания',
    );
    expect(future).toContain(title);
    expect(future).toContain('бір тәуліктен');
    expect(expired).toContain(title);
    expect(expired).toContain('аяқталды');
    expect(opportunityNotificationText('kk', 23)).toContain('23');
    expect(opportunityNotificationText('ru', 23)).toContain('23');
  });
});
