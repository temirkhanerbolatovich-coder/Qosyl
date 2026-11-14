import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('internship conditions show known and unknown values', async ({ page }, info) => {
  const post = {
    id: 'example-internship',
    title: 'Стажировка по разработке',
    summary: 'Тестовая карточка для проверки интерфейса.',
    category: 'internship',
    geography: 'Алматы',
    language: 'ru',
    url: 'https://example.org/internship',
    sourceName: 'Пример организации',
    publishedAt: null,
    approvedAt: '2026-11-13T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    deadline: null,
    eventDate: null,
    workFormat: 'Удалённо',
    kazakhstanEligibility: 'Принимают из Казахстана',
    workload: '15–20 часов в неделю',
    compensation: null,
  };
  await page.route('**/api/content/posts?**', (route) =>
    route.fulfill({ json: { data: { posts: [post], total: 1 } } }),
  );
  await page.goto('/opportunities');
  const card = page.getByRole('article').filter({ hasText: post.title });
  await expect(card).toBeVisible();
  await expect(card.getByText('Принимают из Казахстана')).toBeVisible();
  await expect(card.getByText('15–20 часов в неделю')).toBeVisible();
  // Pay and experience are not confirmed, so a list card names them once instead of two empty rows.
  await expect(card.locator('dl').getByText('Уточняйте у организатора')).toHaveCount(0);
  await expect(card.getByText('Не указано: опыт, оплата. Уточняйте у организатора.')).toBeVisible();
  await expect(card.getByRole('link', { name: 'К организатору' })).toHaveAttribute(
    'href',
    post.url,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.screenshot({ path: info.outputPath('internship.png'), fullPage: true });
});

test('applied filters stay visible and can be removed independently', async ({ page }, info) => {
  await page.route('**/api/content/posts?**', (route) =>
    route.fulfill({ json: { data: { posts: [], total: 0 } } }),
  );
  const query = 'разработка'.repeat(10);
  await page.goto(
    '/opportunities?' +
      new URLSearchParams({
        q: query,
        category: 'internship',
        specialty: 'it',
        geography: 'алматы',
        workMode: 'remote',
        payStatus: 'paid',
        kazakhstanEligible: 'true',
      }),
  );
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  const applied = page.getByRole('list', { name: 'Применённые фильтры' });
  await expect(form.locator('[name=workMode]')).toHaveValue('remote');
  await expect(form.locator('[name=payStatus]')).toHaveValue('paid');
  await expect(form.locator('[name=kazakhstanEligible]')).toHaveValue('true');
  await expect(applied.getByRole('link')).toHaveCount(7);
  await expect(applied.getByRole('link', { name: 'Снять фильтр: Удалённо' })).toBeVisible();
  await expect(page.getByText('Попробуйте снять один из фильтров.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  const toggle = form.locator('.opportunity-filter-toggle');
  const collapsible = await toggle.isVisible();
  if (collapsible) {
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(form.locator('[name=workMode]')).toBeHidden();
    await toggle.focus();
    await page.keyboard.press('Enter');
    // On a phone the filters are a modal sheet: focus moves in, Escape closes it and focus returns.
    const sheet = page.getByRole('dialog', { name: 'Фильтры' });
    await expect(sheet).toBeVisible();
    await expect(form.locator('[name=workMode]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(form.locator('[name=workMode]')).toBeHidden();
    await expect(toggle).toBeFocused();
  }
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('filters.png'), fullPage: true });

  const results = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/content/posts' &&
      url.searchParams.get('page') === '1' &&
      url.searchParams.get('payStatus') === 'paid' &&
      !url.searchParams.has('workMode')
    );
  });
  await applied.getByRole('link', { name: 'Снять фильтр: Удалённо' }).press('Enter');
  const { searchParams } = new URL((await results).url());
  expect(searchParams.get('q')).toBe(query);
  expect(searchParams.get('category')).toBe('internship');
  expect(searchParams.get('specialty')).toBe('it');
  expect(searchParams.get('geography')).toBe('алматы');
  expect(searchParams.get('kazakhstanEligible')).toBe('true');
  await expect(applied.getByRole('link')).toHaveCount(6);
  await expect(form.locator('[name=workMode]')).toHaveValue('');
  await expect(form.locator('[name=payStatus]')).toHaveValue('paid');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);

  if (collapsible) await toggle.click();
  await form.locator('[name=workMode]').selectOption('hybrid');
  // The open phone sheet has its own apply button ("Показать N"); elsewhere it is the form's.
  await (
    collapsible
      ? page.getByRole('dialog', { name: 'Фильтры' }).getByRole('button', { name: /^Показать/ })
      : form.getByRole('button', { name: 'Найти возможности' })
  ).click();
  await expect(page).toHaveURL(/workMode=hybrid/);
  await expect(applied.getByRole('link', { name: 'Снять фильтр: Гибридно' })).toBeVisible();
  if (collapsible) await expect(form.locator('[name=workMode]')).toBeHidden();

  await form.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page).toHaveURL(/\/opportunities$/);
  await expect(applied).toHaveCount(0);
  await expect(form.locator('[name=workMode]')).toHaveValue('');
  await expect(form.locator('[name=payStatus]')).toHaveValue('');
});

test('catalogue count, sorting and pagination survive navigation', async ({ page }, info) => {
  let total = 7;
  const post = {
    id: 'pagination-internship',
    title: 'Стажировка для проверки страниц',
    summary: 'Пример карточки.',
    category: 'internship',
    geography: '',
    language: 'ru',
    url: 'https://example.org/internship',
    sourceName: 'Пример организации',
    publishedAt: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    deadline: null,
    eventDate: null,
  };
  await page.route('**/api/content/posts?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const offset = (Number(params.get('page')) - 1) * 6;
    const size = Math.max(0, Math.min(6, total - offset));
    return route.fulfill({
      json: {
        data: {
          posts: Array.from({ length: size }, (_, index) => ({
            ...post,
            id: `${post.id}-${offset + index}`,
          })),
          total,
        },
      },
    });
  });
  await page.goto('/opportunities?workMode=remote');
  await expect(page.getByRole('status').filter({ hasText: 'Найдено: 7' })).toBeVisible();
  await page.getByRole('button', { name: 'Далее' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('page') === '2');
  await expect(page.getByRole('heading', { name: 'Результаты поиска' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);

  const sort = page.getByLabel('Сортировка');
  await sort.selectOption('deadline');
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('sort') === 'deadline' &&
      url.searchParams.get('workMode') === 'remote' &&
      !url.searchParams.has('page'),
  );
  await expect(page.getByRole('article')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Результаты поиска' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('results.png') });
  await page.goBack();
  await expect(sort).toHaveValue('newest');
  await expect(page).toHaveURL((url) => url.searchParams.get('page') === '2');

  total = 6;
  await page.goto('/opportunities?workMode=remote&page=2#opportunity-pagination-internship-6');
  await page.reload();
  const heading = page.getByRole('heading', { name: 'Результаты поиска' });
  await expect(heading).toBeFocused();
  await expect(page.getByText('На этой странице больше нет результатов.')).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByRole('article')).toHaveCount(6);
  await expect(page.getByRole('status').filter({ hasText: 'Найдено: 6' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Далее' })).toBeDisabled();
});

test('quick filters show counts and empty results offer a filter that helps', async ({
  page,
}, info) => {
  const facets = {
    category: { internship: 4 },
    workMode: { remote: 3 },
    payStatus: { paid: 2 },
    kazakhstanEligible: 1,
    relaxed: { payStatus: 2, workMode: 0 },
  };
  await page.route('**/api/content/posts?**', (route) =>
    route.fulfill({ json: { data: { posts: [], total: 0, facets } } }),
  );
  await page.goto('/opportunities?workMode=remote&payStatus=paid');
  const quick = page.getByRole('navigation', { name: 'Быстрые условия' });
  await expect(quick.getByRole('link', { name: /Стажировки · 4/ })).toBeVisible();
  const remote = quick.getByRole('link', { name: /Удалённо · 3/ });
  await expect(remote).toHaveAttribute('aria-current', 'true');
  await expect(remote).toHaveAttribute('href', /^\/opportunities\?payStatus=paid$/);
  await expect(quick.getByRole('link', { name: /Принимают из Казахстана · 1/ })).toBeVisible();

  const hint = page.getByRole('list', { name: 'Что можно изменить' });
  await expect(hint.getByRole('link')).toHaveCount(1);
  await expect(hint.getByRole('link', { name: 'Снять «С оплатой» · найдётся: 2' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('quick-filters.png'), fullPage: true });

  await hint.getByRole('link').press('Enter');
  await expect(page).toHaveURL(/workMode=remote/);
  await expect(page).not.toHaveURL(/payStatus/);
});

test('card shows extra formats, weekly hours and experience; unknown stays unknown', async ({
  page,
}) => {
  const base = {
    id: 'decision-card',
    title: 'Стажировка с понятными условиями',
    summary: 'Тестовая карточка.',
    category: 'internship',
    geography: '',
    language: 'ru',
    url: 'https://example.org/decision',
    sourceName: 'Пример организации',
    publishedAt: null,
    approvedAt: '2026-11-13T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    deadline: null,
    eventDate: null,
  };
  const known = {
    ...base,
    workMode: 'remote',
    alsoWorkModes: ['hybrid'],
    hoursPerWeekMax: 20,
    noExperience: true,
  };
  const unknown = { ...base, id: 'unknown-card', title: 'Стажировка без подтверждений' };
  await page.route('**/api/content/posts?**', (route) =>
    route.fulfill({ json: { data: { posts: [known, unknown], total: 2 } } }),
  );
  await page.goto('/opportunities');
  const first = page.getByRole('article').filter({ hasText: known.title });
  await expect(first.getByText('Удалённо или Гибридно')).toBeVisible();
  await expect(first.getByText('До 20 часов в неделю')).toBeVisible();
  await expect(first.getByText('Не требуется')).toBeVisible();
  // Unconfirmed values are never turned into a "no": all stay "to clarify".
  const second = page.getByRole('article').filter({ hasText: unknown.title });
  await expect(
    second.getByText(
      'Не указано: формат, участие из Казахстана, нагрузка, опыт, оплата. Уточняйте у организатора.',
    ),
  ).toBeVisible();
});
