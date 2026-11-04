import { describe, it, expect } from 'vitest';
import { adminCodeLabel } from '../src/lib/admin-labels';
import { marketplaceCopy } from '../src/lib/marketplace-copy';
import { contentStatuses, sourceTypes } from '../src/lib/content-validation';

describe('administrative locale boundaries', () => {
  it('labels all content states, origins and run states without altering machine codes', () => {
    for (const code of [
      ...contentStatuses,
      ...sourceTypes,
      'approve_project',
      'resolve_report',
      'record_pilot_cost',
      'void_pilot_cost',
      'legacy',
      'import',
      'editorial',
      'queued',
      'running',
      'succeeded',
      'failed',
      'skipped',
    ]) {
      expect(adminCodeLabel(code, 'ru')).not.toBe(code);
      expect(adminCodeLabel(code, 'kk')).not.toBe(code);
    }
    for (const code of ['future_status', 'constructor', '__proto__']) {
      expect(adminCodeLabel(code, 'ru')).toBe(code);
      expect(adminCodeLabel(code, 'kk')).toBe(code);
    }
  });
  it('retranslates stored local feedback while retaining unknown audit details', () => {
    const stored = 'Сохранено. Публикация не выполнялась.';
    expect(marketplaceCopy(stored, 'kk')).toBe('Сақталды. Жариялау орындалмады.');
    expect(marketplaceCopy(stored, 'ru')).toBe(stored);
    const original = 'Синтетическая причина решения №312: проверить оригинал.';
    expect(marketplaceCopy(original, 'kk')).toBe(original);
  });
  it('preserves the non-mutating worker and manual-contact limitations in copy', () => {
    expect(
      marketplaceCopy(
        'История показывает завершённые проходы. Включённая настройка сама по себе не подтверждает, что процесс сейчас работает. На выключенном компьютере обработка не выполняется. Просмотр этого раздела не запускает задания.',
        'kk',
      ),
    ).toContain('іске қоспайды');
    expect(
      marketplaceCopy(
        'Это внутренний учёт действий человека. Программа не отправляет сообщения и не подтверждает согласие самостоятельно. Не сохраняйте пароли и лишние персональные данные.',
        'kk',
      ),
    ).toContain('өздігінен растамайды');
  });
});
