import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInDemo } from './demo-session';

const post = (id: string) => ({
  id,
  title: `Карточка каталога ${id}`,
  summary: 'Пример карточки. '.repeat(12),
  category: 'internship',
  geography: '',
  language: 'ru',
  url: `https://example.org/${id}`,
  sourceName: 'Пример организации',
  publishedAt: null,
  approvedAt: '2026-11-13T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  deadline: null,
  eventDate: null,
});

/** Answers the list request with cards and the one-item count request with a fixed total. */
async function mockCatalogue(page: import('@playwright/test').Page, countTotal = 7) {
  const requests: URL[] = [];
  await page.route('**/api/content/posts?**', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (url.searchParams.get('limit') === '1')
      return route.fulfill({ json: { data: { posts: [], total: countTotal } } });
    return route.fulfill({
      json: { data: { posts: [post('one'), post('two'), post('three')], total: 3 } },
    });
  });
  return requests;
}

test('wide screens put the filters beside the results and the first card above the fold', async ({
  page,
}, info) => {
  await mockCatalogue(page);
  await page.goto('/opportunities');
  const wide = page.viewportSize()!.width >= 1024;
  const aside = page.getByRole('complementary', { name: 'Поиск и фильтры' });
  const first = page.getByRole('article').first();
  await expect(first).toBeVisible();
  const asideBox = (await aside.boundingBox())!;
  const firstBox = (await first.boundingBox())!;
  if (wide) {
    // Two columns: the filters are to the left of the results and the first card is on the first screen.
    expect(asideBox.x + asideBox.width).toBeLessThanOrEqual(firstBox.x + 1);
    expect(firstBox.y).toBeLessThan(page.viewportSize()!.height);
  } else {
    expect(asideBox.y).toBeLessThan(firstBox.y);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('catalogue.png') });
});

test('the draft result count follows the unsent choices', async ({ page }) => {
  const requests = await mockCatalogue(page, 4);
  await page.goto('/opportunities');
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  const toggle = form.locator('.opportunity-filter-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await form.locator('[name=workMode]').selectOption('remote');
  // The count is also printed in the phone sheet footer, which is hidden on wide screens.
  await expect(form.locator('p:visible', { hasText: 'Найдётся: 4' })).toBeVisible();
  const counting = requests.find(
    (url) => url.searchParams.get('limit') === '1' && url.searchParams.get('workMode') === 'remote',
  );
  expect(counting).toBeTruthy();
  // The count is a preview: nothing was applied, so the address is unchanged.
  expect(new URL(page.url()).searchParams.has('workMode')).toBe(false);
});

test('the phone filter sheet counts, traps focus, closes and applies', async ({ page }) => {
  await mockCatalogue(page, 5);
  await page.goto('/opportunities');
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  const toggle = form.locator('.opportunity-filter-toggle');
  test.skip(!(await toggle.isVisible()), 'The sheet exists only on a phone-width screen.');
  await toggle.click();
  const sheet = page.getByRole('dialog', { name: 'Фильтры' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('aria-modal', 'true');
  await form.locator('[name=payStatus]').selectOption('paid');
  const apply = sheet.getByRole('button', { name: 'Показать 5' });
  await expect(apply).toBeVisible();

  // Tab stays inside the sheet.
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press('Tab');
    expect(await sheet.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  // Escape closes it and gives focus back to the button that opened it.
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(toggle).toBeFocused();
  // The chosen value survives closing and the button counts it.
  await expect(form.locator('[name=payStatus]')).toHaveValue('paid');

  await toggle.click();
  await sheet.getByRole('button', { name: /^Показать/ }).click();
  await expect(page).toHaveURL(/payStatus=paid/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(form.locator('.opportunity-filter-toggle')).toContainText('Фильтры · 1');
});

test('a signed-in student can follow a search in one step and stop following it', async ({
  page,
}) => {
  await signInDemo(page, 'student');
  await mockCatalogue(page);
  let searches: unknown[] = [];
  const commands: Record<string, unknown>[] = [];
  await page.route('**/api/opportunities/saved', async (route) => {
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON();
      commands.push(command);
      if (command.action === 'saveSearch')
        searches = [
          {
            id: 'search-1',
            name: command.name,
            filters: command.filters,
            createdAt: '2026-11-14T00:00:00.000Z',
            notificationFrequency: command.frequency,
            nextNotificationAt: '2026-11-15T00:00:00.000Z',
          },
        ];
      if (command.action === 'removeSearch') searches = [];
      return route.fulfill({ json: { data: { saved: true } } });
    }
    return route.fulfill({ json: { data: { favorites: [], searches } } });
  });
  await page.goto('/opportunities?q=грант');
  const follow = page.getByRole('button', { name: 'Следить за этим поиском' });
  await expect(follow).toBeEnabled();
  await follow.click();
  await expect(
    page.locator('.toast').filter({ hasText: 'Вы следите за поиском. Новые совпадения придут' }),
  ).toBeVisible();
  expect(commands.at(-1)).toMatchObject({
    action: 'saveSearch',
    frequency: 'daily',
    filters: { q: 'грант' },
  });
  const stop = page.getByRole('button', { name: 'Не следить за поиском' });
  await expect(stop).toHaveAttribute('aria-pressed', 'true');
  await stop.click();
  await expect(page.getByRole('button', { name: 'Следить за этим поиском' })).toBeVisible();
  expect(commands.at(-1)).toEqual({ action: 'removeSearch', searchId: 'search-1' });
});
