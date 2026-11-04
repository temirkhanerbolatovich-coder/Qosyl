import { describe, it, expect } from 'vitest';
import { parseHtmlOpportunities } from '../src/lib/content-html';
import { normalizeContentItem } from '../src/lib/content-feed';
import { publicContentQueryInput, sourceInput } from '../src/lib/content-validation';
describe('HTML opportunity discovery', () => {
  it('imports the article itself instead of related posts or application buttons', () => {
    const result = parseHtmlOpportunities(
      '<html><meta property="og:type" content="article"><header><h1>Студенческая научная стажировка</h1></header><article><p>' +
        'Условия исследовательского конкурса. '.repeat(5) +
        '</p><h2><a href="/apply">Подать заявку на конкурс</a></h2><h2><a href="/old">Старая связанная новость</a></h2></article></html>',
      'https://example.org/program',
      'example.org',
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      canonicalUrl: 'https://example.org/program',
      title: 'Студенческая научная стажировка',
      category: 'competition',
    });
    expect(result.items[0].summary).toContain('Условия исследовательского');
  });
  it('uses article metadata when the university does not render an h1', () => {
    const result = parseHtmlOpportunities(
      '<meta property="og:type" content="article"><meta property="og:title" content="Конкурс для студентов педагогики"><main><p>' +
        'Приглашаем студентов представить математические задачи. '.repeat(3) +
        '</p></main>',
      'https://example.org/contest',
      'example.org',
    );
    expect(result.items[0].title).toBe('Конкурс для студентов педагогики');
  });
  it('prefers the publication title to a site branding h1', () => {
    const result = parseHtmlOpportunities(
      '<header><h1>Университет Казахстана</h1></header><article><h1>Конкурс грантов для студентов</h1><p>' +
        'Приглашаем принять участие в исследовательском конкурсе. '.repeat(3) +
        '</p></article>',
      'https://example.org/grant',
      'example.org',
    );
    expect(result.items[0].title).toBe('Конкурс грантов для студентов');
  });
  it('extracts Astana Hub literal card URLs without executing scripts', () => {
    const html = `<html lang="ru"><article class="card-item" @click="window.location.href='/ru/event/semey/'"><h3>Semey Hub: инженерная конференция</h3><p>Для студентов колледжей</p></article><script>throw Error("never execute")</script></html>`;
    const result = parseHtmlOpportunities(html, 'https://astanahub.com/ru/event/', 'astanahub.com');
    expect(result.items[0]).toMatchObject({
      category: 'event',
      language: 'ru',
      deadline: null,
      eventDate: null,
      canonicalUrl: 'https://astanahub.com/ru/event/semey/',
    });
  });
  it('excludes Hub author profiles and keeps neutral articles distinct from events', () => {
    const result = parseHtmlOpportunities(
      '<h2><a href="/account/user/123/">Имя автора материала</a></h2><a href="/ru/article/guide"><h2>Как устроена работа команды</h2></a><a href="/ru/article/"><h2>Все статьи портала</h2></a>',
      'https://astanahub.com/ru/article/',
      'astanahub.com',
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      category: 'article',
      canonicalUrl: 'https://astanahub.com/ru/article/guide',
    });
  });
  it('deduplicates listing links, excludes external links and bounds output', () => {
    const html =
      '<main><h2><a href="/grant">Грант для молодых врачей</a></h2><h2><a href="/grant">Повторная ссылка</a></h2><h2><a href="https://evil.test/x">Другой источник</a></h2><h2><a href="/intern">Стажировка для педагогов</a></h2></main>';
    const result = parseHtmlOpportunities(html, 'https://example.org/news', 'example.org', 1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].category).toBe('grant');
    expect(result.found).toBe(3);
    expect(result.discarded).toBe(2);
  });
  it('fails visibly on JS shells and login pages', () => {
    expect(() =>
      parseHtmlOpportunities(
        '<html><div id="root"></div><script>data()</script></html>',
        'https://example.org',
        'example.org',
      ),
    ).toThrow('UNSUPPORTED_FEED');
  });
  it('keeps the summary inside a linked university card', () => {
    const result = parseHtmlOpportunities(
      '<a href="/ru/news/1"><h3>Обучение за рубежом для студентов</h3><p>Аграрный университет объявляет конкурсный отбор</p></a>',
      'https://example.org/ru/anons',
      'example.org',
    );
    expect(result.items[0].summary).toContain('Аграрный университет');
  });
  it('separates Abai card title and raw date without inventing a timezone', () => {
    const result = parseHtmlOpportunities(
      '<a href="/ru/news/1"><div class="cnews-date"><p>23.10.2026</p></div><div class="cnews__title"><p>Состоится научный семинар</p></div></a>',
      'https://abai.university/ru/news',
      'abai.university',
    );
    expect(result.items[0]).toMatchObject({
      title: 'Состоится научный семинар',
      publishedAt: null,
      publishedAtRaw: '23.10.2026',
      summary: '',
      category: 'event',
    });
  });
  it('keeps an article source and unknown dates without inventing eligibility', () => {
    const result = parseHtmlOpportunities(
      '<article><h1>Государственные гранты для педагогов</h1><p>' +
        'Условия участия уточняются. '.repeat(8) +
        '</p></article>',
      'https://example.org/program',
      'example.org',
    );
    expect(result.items[0]).toMatchObject({ category: 'grant', publishedAt: null, deadline: null });
  });
  it.each([
    ['Гранты для медицинских исследований', 'grant'],
    ['Студенческая олимпиада по финансам', 'competition'],
    ['РЕСПУБЛИКАЛЫҚ ЭССЕ БАЙҚАУЫНЫҢ ҚОРЫТЫНДЫСЫ ШЫҒАРЫЛДЫ', 'news'],
    ['Ұлттық ойындардан турнир өтті', 'news'],
    ['В alem.ai наградили победителей хакатона', 'news'],
    ['Ғылыми жобалар конкурсына өтінімдер қабылданады: грант', 'grant'],
    ['Стипендия для дизайнеров', 'scholarship'],
    ['Профессиональная практика для агрономов', 'internship'],
    ['Итоги конкурса инженеров', 'news'],
    ['В университете прошла ярмарка стажировок', 'news'],
    ['Прошло праздничное мероприятие студентов', 'news'],
    ['Состоялся конкурс студентов', 'news'],
    ['Состоялись соревнования инженеров', 'news'],
    ['Обладатели вакантных образовательных грантов', 'news'],
    ['Состоится научный семинар для педагогов', 'event'],
    ['Открыт прием заявок по программе академической мобильности', 'training'],
    ['Интенсив: практические занятия', 'training'],
  ])('classifies %s', (title, category) => {
    expect(
      normalizeContentItem({ title, url: '/x' }, 'https://example.org', 'example.org').category,
    ).toBe(category);
  });
  it('validates automatic source URLs and search bounds', () => {
    expect(
      sourceInput.safeParse({
        name: 'Госпрограмма',
        type: 'html',
        allowedHost: 'example.org',
        feedUrl: 'https://example.org/program',
        rightsNote: 'Публичный источник; только закрытая очередь',
      }).success,
    ).toBe(true);
    expect(publicContentQueryInput.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    expect(publicContentQueryInput.safeParse({ specialty: 'fake' }).success).toBe(false);
  });
});
