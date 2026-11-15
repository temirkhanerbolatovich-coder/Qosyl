import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { signInDemo } from './demo-session';

async function inspectEmptyState(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const baselineOnly = process.env.UI_QUALITY_BASELINE === 'true';
  await info.attach(`${name}-audit`, {
    body: JSON.stringify({ mode: baselineOnly ? 'observation' : 'enforced', layout, ...audit }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  if (!baselineOnly) {
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
    expect(
      audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
    ).toEqual([]);
  }
}

async function setKazakh(page: Page) {
  const menu = page.locator('button[aria-controls="header-navigation"]');
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
  await page.locator('.locale-switch select').selectOption('kk');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  if (await menu.isVisible()) await menu.click();
}

test('empty catalogue waits for loading, provides next steps and translates them', async ({
  page,
}, info) => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/platform?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'catalog')
      return route.continue();
    await waiting;
    await route.fulfill({ json: { data: { projects: [], total: 0, categories: [], page: 1 } } });
  });
  try {
    await page.goto('/projects?sort=newest&page=1');
    await expect(page.getByRole('status', { name: 'Загрузка' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Сейчас открытых проектов нет' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('heading', { name: 'Подходящих проектов пока нет' })).toHaveCount(
      0,
    );
  } finally {
    release();
  }

  await expect(page.getByRole('heading', { name: 'Сейчас открытых проектов нет' })).toBeVisible();
  await expect(page.getByText('Новые проекты появляются после проверки модератором')).toBeVisible();
  await expect(page.getByRole('link', { name: /стажировки и возможности/i })).toHaveAttribute(
    'href',
    '/opportunities',
  );
  await expect(page.getByRole('link', { name: 'Разместить задачу' })).toHaveAttribute(
    'href',
    '/client/projects/new',
  );
  await expect(page.getByRole('link', { name: 'Заполнить профиль' })).toHaveCount(0);
  await inspectEmptyState(page, info, 'projects-empty-ru');

  await setKazakh(page);
  await expect(page.getByRole('heading', { name: 'Қазір ашық жобалар жоқ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Тағылымдамалар мен мүмкіндіктер' })).toHaveAttribute(
    'href',
    '/opportunities',
  );
  await expect(page.getByRole('link', { name: 'Тапсырма жариялау' }).last()).toHaveAttribute(
    'href',
    '/client/projects/new',
  );
  await inspectEmptyState(page, info, 'projects-empty-kk');
});

test('empty catalogue offers the profile link to a student', async ({ page }) => {
  await signInDemo(page, 'student');
  await page.route('**/api/platform?**', (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'catalog')
      return route.continue();
    return route.fulfill({ json: { data: { projects: [], total: 0, categories: [], page: 1 } } });
  });
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Сейчас открытых проектов нет' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Заполнить профиль' })).toHaveAttribute(
    'href',
    '/student/profile',
  );
  await setKazakh(page);
  await expect(page.getByRole('link', { name: 'Профильді толтыру' })).toHaveAttribute(
    'href',
    '/student/profile',
  );
});

test('empty filtered results expose removable filters and reset them', async ({ page }, info) => {
  const search = new URLSearchParams({
    category: 'design',
    skill: 'qosyl-no-such-skill-20261115',
    sort: 'newest',
    page: '2',
  });
  await page.goto(`/projects?${search}`);
  await expect(page.getByRole('heading', { name: 'Подходящих проектов пока нет' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Сейчас открытых проектов нет' })).toHaveCount(0);
  await inspectEmptyState(page, info, 'projects-filtered-empty');
  const removeCategory = page.getByRole('link', { name: /Удалить фильтр: Категория/ });
  await expect(removeCategory).toBeVisible();
  await removeCategory.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL((url) => {
    return (
      !url.searchParams.has('category') &&
      !url.searchParams.has('page') &&
      url.searchParams.get('skill') === 'qosyl-no-such-skill-20261115' &&
      url.searchParams.get('sort') === 'newest'
    );
  });
  await expect(page.getByRole('heading', { name: 'Подходящих проектов пока нет' })).toBeVisible();
  await page.getByRole('link', { name: 'Сбросить фильтры', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test('a repeated filter shows the last nonempty value and removes all of its copies', async ({
  page,
}) => {
  await page.goto('/projects?skill=&skill=qosyl-no-such-skill-20261115&page=2');
  await expect(page.getByRole('heading', { name: 'Подходящих проектов пока нет' })).toBeVisible();
  const chip = page.getByRole('link', {
    name: 'Удалить фильтр: Навык: qosyl-no-such-skill-20261115',
    exact: true,
  });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page).toHaveURL(
    (url) => !url.searchParams.has('skill') && !url.searchParams.has('page'),
  );
});

test('a long unbroken search filter fits without page overflow', async ({ page }, info) => {
  const query = 'q'.repeat(140);
  await page.goto(`/projects?q=${query}`);
  await expect(page.getByRole('heading', { name: 'Подходящих проектов пока нет' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: `Удалить фильтр: Поиск: ${query}`, exact: true }),
  ).toBeVisible();
  await inspectEmptyState(page, info, 'projects-long-search-empty');
});

test('a vacant result page does not claim the catalogue is empty', async ({ page }) => {
  await page.route('**/api/platform?**', (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'catalog')
      return route.continue();
    return route.fulfill({ json: { data: { projects: [], total: 3, categories: [], page: 3 } } });
  });
  await page.goto('/projects?skill=excel&sort=newest&page=3');
  await expect(page.getByRole('heading', { name: 'На этой странице проектов нет' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Сейчас открытых проектов нет' })).toHaveCount(0);
  const firstPage = page.getByRole('link', { name: 'К первой странице' });
  const href = await firstPage.getAttribute('href');
  const url = new URL(href!, 'http://localhost');
  expect(url.pathname).toBe('/projects');
  expect(url.searchParams.get('skill')).toBe('excel');
  expect(url.searchParams.get('sort')).toBe('newest');
  expect(url.searchParams.has('page')).toBe(false);
});

test('catalogue request failure offers retry instead of an empty state', async ({ page }) => {
  await page.route('**/api/platform?**', (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'catalog')
      return route.continue();
    return route.fulfill({ status: 503, json: { error: 'Synthetic catalogue error' } });
  });
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Не удалось открыть страницу' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Сейчас открытых проектов нет' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Подходящих проектов пока нет' })).toHaveCount(0);
});
