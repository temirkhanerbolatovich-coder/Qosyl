import { describe, expect, it } from 'vitest';
import {
  extractDeadlineDate,
  inspectOpportunityHtml,
  formatOpportunityInspection,
} from '../src/lib/opportunity-detail';
const now = new Date('2026-10-27T12:00:00Z');
const inspect = (body: string) =>
  inspectOpportunityHtml(
    '<html><title>Проверка возможностей</title><article>' + body + '</article></html>',
    'https://example.org/item',
    'example.org',
    now,
  );
describe('editorial detail evidence', () => {
  it.each([
    ['Принимаются до 30 октября 2026 года', '2026-10-30'],
    ['Срок подачи с 13.10.2026 – 20.10.2026', '2026-10-20'],
    ['Срок приёма: с 13 октября по 11 ноября 2026 года', '2026-11-11'],
    ['2026 жылғы 30 қазанға дейін', '2026-10-30'],
    ['До 30 октября', null],
    ['Өтінімдер 2026 жылғы 13 қазан мен 13 қараша аралығында қабылданады', null],
    ['До 31.02.2026', null],
    ['До 29.02.2028', '2028-02-29'],
    ['Первый дедлайн 01.11.2026, второй 05.11.2026', null],
  ])('retains calendar semantics: %s', (text, date) =>
    expect(extractDeadlineDate(text)).toBe(date),
  );
  it('reads heading-based article text and preserves a Kazakh staff restriction', () => {
    const result = inspect(
      '<h2>Университет қызметкерлеріне арналған грант</h2><h2>Құжаттарды 2026 жылғы 13 қарашаға дейін тапсыруға болады</h2>',
    );
    expect(result.deadlines[0].calendarDate).toBe('2026-11-13');
    expect(result.conditions[0]).toContain('қызметкерлеріне');
  });
  it('marks an expired application window without inventing a timestamp', () => {
    const result = inspect(
      '<p>Срок подачи документов с 13.10.2026 – 20.10.2026</p><p>Только граждане РК, резиденты 2 курса</p>',
    );
    expect(result.status).toBe('past_deadline');
    expect(result.deadlines[0]).toMatchObject({
      calendarDate: '2026-10-20',
      instant: null,
      timezone: null,
    });
    expect(result.conditions).toContain('Только граждане РК, резиденты 2 курса');
  });
  it('never treats a future deadline as verified eligibility', () => {
    const result = inspect('<p>Документы принимаются до 30 октября 2026 года</p>');
    expect(result.status).toBe('invitation_unverified');
    expect(result.reviewRequired).toBe(true);
  });
  it('keeps adjacent-day timezone ambiguity', () =>
    expect(inspect('<p>Срок подачи документов: 26.10.2026</p>').status).not.toBe('past_deadline'));
  it('keeps conflicting deadlines for review', () => {
    const r = inspect(
      '<p>Срок подачи документов: 20.10.2026</p><p>Последний день подачи: 30.10.2026</p>',
    );
    expect(r.conflictingDeadlines).toBe(true);
    expect(r.status).not.toBe('past_deadline');
  });
  it('does not borrow the year or date from an adjacent event sentence', () => {
    const result = inspect(
      '<p>Приём заявок до 29 октября. Конференция состоится 30 октября 2026 года.</p>',
    );
    expect(result.deadlines).toHaveLength(1);
    expect(result.deadlines[0].calendarDate).toBeNull();
  });
  it.each([
    'Приём заявок до 29 октября, конференция состоится 30 октября 2026 года.',
    'Конференция состоится 30 октября 2026 года, заявки до 29 октября.',
  ])('keeps event clauses out of a yearless deadline: %s', (text) => {
    const result = inspect(`<p>${text}</p>`);
    expect(result.deadlines[0].calendarDate).toBeNull();
  });
  it('finds student submission windows and future closing statements', () => {
    const result = inspect(
      '<p>Работы принимаются с 13 октября по 10 ноября 2026 года. Результаты будут объявлены 23 ноября 2026 года.</p><p>Прием заявок завершится 10 ноября 2026 года в 15:00 по времени Астаны.</p>',
    );
    expect(result.deadlines.map((d) => d.calendarDate)).toEqual(['2026-11-10', '2026-11-10']);
    expect(result.status).not.toBe('closed');
  });
  it.each([
    'Приём заявок не завершён',
    'Приём заявок ещё не закрыт',
    'Applications are not closed',
  ])('preserves a negated closure: %s', (text) => {
    expect(
      inspect(`<p>${text}. Документы принимаются до 30 октября 2026 года.</p>`).status,
    ).not.toBe('closed');
  });
  it('does not promote last year closure into a current closure', () => {
    expect(
      inspect(
        '<p>В прошлом году приём заявок завершён в октябре.</p><p>Документы принимаются до 30 октября 2026 года.</p>',
      ).status,
    ).not.toBe('closed');
  });
  it('retains the list immediately below an eligibility heading', () => {
    const result = inspect(
      '<h2>Требования для участия:</h2><ul><li>2–3 курс</li><li>Не ниже B2</li><li>Без академической задолженности</li></ul>',
    );
    expect(result.conditions).toEqual(
      expect.arrayContaining(['2–3 курс', 'Не ниже B2', 'Без академической задолженности']),
    );
  });
  it('extracts unvisited safe application references and ignores navigation', () => {
    const result = inspect(
      '<nav><a href="https://other.org/signup">Регистрация</a></nav><p>Регистрация: <a href="https://forms.gle/realForm">заполнить заявку</a></p><p><a href="/apply">Подать заявку</a></p><p><a href="javascript:run()">Регистрация</a><a href="https://127.0.0.1/apply">Регистрация</a><a href="#apply">Регистрация</a></p>',
    );
    expect(result.applicationLinks).toEqual([
      { url: 'https://forms.gle/realForm', label: 'заполнить заявку', external: true },
      { url: 'https://example.org/apply', label: 'Подать заявку', external: false },
    ]);
  });
  it('bounds stored evidence and explicitly discloses shortened fragments', () => {
    const result = inspect(
      '<p>Приём заявок до 30 октября 2026 года. ' +
        'Студентам необходимы документы. '.repeat(80) +
        '</p>',
    );
    const reason = formatOpportunityInspection(
      {
        ...result,
        url: 'https://example.org/' + 'a'.repeat(1900),
        conditions: Array(6).fill('Требования '.repeat(30)),
        deadlines: Array(4).fill({
          raw: 'Срок подачи '.repeat(40),
          calendarDate: null,
          instant: null,
          timezone: null,
        }),
      },
      7,
    );
    expect(reason.length).toBeLessThanOrEqual(2000);
    expect(reason).toContain('редакция № 7');
    expect(reason).toContain('сокращена');
    expect(reason).toContain('Формы/вложения не проверены');
  });
  it('does not interpret publication or event dates as deadlines', () =>
    expect(inspect('<p>Опубликовано 13.10.2026. Конференция 30.10.2026</p>').deadlines).toEqual(
      [],
    ));
  it('ignores menus, scripts, forms and related recommendations', () => {
    const r = inspect(
      '<nav><p>Приём заявок до 20.10.2026</p></nav><script>execute()</script><form><p>Срок подачи: 20.10.2026</p></form><aside><p>Принимаются до 20.10.2026</p></aside><p>Новость университета</p>',
    );
    expect(r.status).toBe('unknown');
    expect(r.deadlines).toEqual([]);
  });
  it('prioritizes an explicit closure', () =>
    expect(
      inspect('<p>Приём заявок завершён</p><p>Документы принимаются до 30.10.2026</p>').status,
    ).toBe('closed'));
  it('fails on unsupported shells rather than pretending to extract', () =>
    expect(() =>
      inspectOpportunityHtml(
        '<title>Loading</title><div id="root"></div>',
        'https://example.org/item',
        'example.org',
        now,
      ),
    ).toThrow('UNSUPPORTED_FEED'));
  it('rejects foreign hosts and oversized input', () => {
    expect(() => inspectOpportunityHtml('', 'https://other.org/item', 'example.org', now)).toThrow(
      'INVALID_CONTENT_URL',
    );
    expect(() => inspect('x'.repeat(1_048_577))).toThrow('FEED_TOO_LARGE');
  });
});
