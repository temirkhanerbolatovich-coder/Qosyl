import { describe, expect, it } from 'vitest';
import { marketplaceCopy } from '../src/lib/marketplace-copy';
import { eventLabels, paymentLabels } from '../src/lib/labels';
import { localizedEventLabels, localizedPaymentLabels } from '../src/lib/localized-labels';

describe('marketplace locale boundaries', () => {
  it('translates exact file and editorial errors without losing limitations', () => {
    expect(marketplaceCopy('Файл уже включён в сдачу и сохранён в истории.', 'kk')).toContain(
      'тарихта сақталған',
    );
    expect(
      marketplaceCopy('Файлы доступны после согласования условий обеими сторонами.', 'kk'),
    ).toContain('екі тарап');
    expect(marketplaceCopy('Публиковать можно только материал на проверке.', 'kk')).toContain(
      'тексерудегі',
    );
    expect(
      marketplaceCopy('Передача недоступна: проверьте срок, согласие и владельца.', 'ru'),
    ).toContain('согласие');
    expect(marketplaceCopy('Материал не найден. Причина пользователя', 'kk')).toBe(
      'Материал не найден. Причина пользователя',
    );
  });
  it('translates exact server errors without changing unknown details', () => {
    expect(marketplaceCopy('Срок заказа истек.', 'kk')).toBe('Тапсырыстың мерзімі аяқталды.');
    expect(marketplaceCopy('По оплате открыт спор. Требуется ручное разрешение.', 'kk')).toContain(
      'дау',
    );
    expect(marketplaceCopy('Срок заказа истек.', 'ru')).toBe('Срок заказа истек.');
    expect(marketplaceCopy('Срок заказа истек. Причина пользователя', 'kk')).toBe(
      'Срок заказа истек. Причина пользователя',
    );
  });
  it('retranslates stable local feedback without changing its stored identity', () => {
    const message = 'Ваша сторона подтвердила условия';
    expect(marketplaceCopy(message, 'kk')).toBe('Сіздің тарапыңыз шарттарды растады');
    expect(marketplaceCopy(message, 'ru')).toBe(message);
    expect(
      marketplaceCopy('Добавьте хотя бы одну HTTPS-ссылку или выберите файл результата.', 'kk'),
    ).toContain('HTTPS');
  });
  it('preserves unrecognized detail exactly, including prototype property names', () => {
    for (const text of ['Модератор: причина №42 — уточнить права.', 'constructor', '__proto__', ''])
      expect(marketplaceCopy(text, 'kk')).toBe(text);
  });
  it('preserves every payment and history enum while providing both locales', () => {
    expect(localizedEventLabels('ru')).toEqual(eventLabels);
    expect(localizedPaymentLabels('ru')).toEqual(paymentLabels);
    expect(Object.keys(localizedEventLabels('kk')).sort()).toEqual(Object.keys(eventLabels).sort());
    expect(Object.keys(localizedPaymentLabels('kk')).sort()).toEqual(
      Object.keys(paymentLabels).sort(),
    );
    expect(localizedPaymentLabels('kk').reported_paid_by_client).toBe(
      'Тапсырыс беруші төлем туралы хабарлады',
    );
    expect(localizedPaymentLabels('kk').confirmed_received_by_student).toBe(
      'Орындаушы төлемді алғанын растады',
    );
  });
  it('keeps the explicit external payment and unscanned-file limitations', () => {
    expect(
      marketplaceCopy(
        'Это заявления участников о расчёте вне площадки. Платформа не проводит и не гарантирует платежи.',
        'kk',
      ),
    ).toContain('кепілдік бермейді');
    expect(
      marketplaceCopy(
        'Антивирусная проверка не выполнялась. Скачивайте только ожидаемые файлы от участника, которому доверяете, и проверяйте их перед открытием.',
        'kk',
      ),
    ).toContain('жүргізілген жоқ');
  });
});
