import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function inspect(page: Page, info: TestInfo, name: string) {
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

test('a project that does not exist is a closed page with a way back, not a retryable error', async ({
  page,
}, info) => {
  const response = page.waitForResponse(
    (r) => r.url().includes('/api/platform') && r.url().includes('view=project'),
  );
  await page.goto('/projects/no-such-project-qosyl-005');
  expect((await response).status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Проект закрыт или ещё не опубликован' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Не удалось открыть страницу' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Повторить' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Войти в аккаунт' })).toBeVisible();
  await inspect(page, info, 'project-not-found-ru');

  await setKazakh(page);
  await expect(
    page.getByRole('heading', { name: 'Жоба жабылған немесе әлі жарияланбаған' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Қайталау' })).toHaveCount(0);
  await inspect(page, info, 'project-not-found-kk');

  await page.getByRole('link', { name: 'Жобалар каталогына' }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test('an unavailable server keeps the retry state and never claims the project is closed', async ({
  page,
}) => {
  await page.route('**/api/platform?**', (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'project')
      return route.continue();
    return route.fulfill({ status: 503, json: { error: 'Synthetic unavailable detail' } });
  });
  await page.goto('/projects/any-project');
  await expect(page.getByRole('heading', { name: 'Не удалось открыть страницу' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Проект закрыт или ещё не опубликован' }),
  ).toHaveCount(0);
});

test('a failed network request keeps the retry state', async ({ page }) => {
  await page.route('**/api/platform?**', (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'project')
      return route.continue();
    return route.abort('failed');
  });
  await page.goto('/projects/any-project');
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Проект закрыт или ещё не опубликован' }),
  ).toHaveCount(0);
});
