import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';

async function checkState(page: Page, info: TestInfo, name: string) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  await info.attach(`${name}-audit`, {
    body: JSON.stringify({
      mode: 'enforced',
      layout,
      violations: axe.violations,
      incomplete: axe.incomplete,
    }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(
    axe.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
}

test('opportunities: slow response is loading, not empty; identical search completes', async ({
  page,
}, info) => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/content/posts?**', async (route) => {
    await waiting;
    await route.continue();
  });
  try {
    await page.goto('/opportunities');
    await expect(page.getByRole('status')).toHaveText('Ищем возможности…');
    await expect(page.getByText(/Опубликованных материалов по запросу пока нет/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled();
    await checkState(page, info, 'opportunities-loading');
  } finally {
    release();
  }
  await expect(page.getByText(/Опубликованных материалов по запросу пока нет/)).toBeVisible();
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  await form.getByRole('button', { name: 'Найти возможности' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByText(/Опубликованных материалов по запросу пока нет/)).toBeVisible();
  await checkState(page, info, 'opportunities-empty');
});

test('opportunities: failed request offers retry and preserves entered filters', async ({
  page,
}, info) => {
  let fail = true;
  await page.route('**/api/content/posts?**', (route) =>
    fail
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporarily unavailable' }),
        })
      : route.continue(),
  );
  await page.goto('/opportunities');
  await expect(
    page.getByRole('region', { name: 'Возможности и события' }).getByRole('alert'),
  ).toContainText('Не удалось загрузить возможности');
  const form = page.getByRole('form', { name: 'Поиск возможностей' });
  await form.locator('[name=q]').fill('педагогика');
  await form.locator('[name=specialty]').selectOption('education');
  await checkState(page, info, 'opportunities-error');
  fail = false;
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(
    page.getByRole('region', { name: 'Возможности и события' }).getByRole('alert'),
  ).toHaveCount(0);
  await expect(page.getByText(/Опубликованных материалов по запросу пока нет/)).toBeVisible();
  await expect(form.locator('[name=q]')).toHaveValue('педагогика');
  await expect(form.locator('[name=specialty]')).toHaveValue('education');
});

test('catalogue: mobile disclosure preserves input, applies URL filters and resets empty results', async ({
  page,
}, info) => {
  await page.goto('/projects');
  await expect(page.locator('.project-card').first()).toBeVisible();
  const toggle = page.getByRole('button', { name: /^Фильтры/ });
  if (await toggle.isVisible()) await toggle.click();
  const filter = page.locator('.filter-panel');
  await filter.getByLabel('Навык', { exact: true }).fill('qosyl-no-such-skill-20261027');
  if (await toggle.isVisible()) {
    await toggle.click();
    await toggle.click();
    await expect(filter.getByLabel('Навык', { exact: true })).toHaveValue(
      'qosyl-no-such-skill-20261027',
    );
  }
  await filter.getByRole('button', { name: 'Применить фильтры' }).click();
  await expect(page).toHaveURL(/skill=qosyl-no-such-skill-20261027/);
  await expect(page.getByRole('heading', { name: 'Подходящих проектов пока нет' })).toBeVisible();
  await checkState(page, info, 'catalogue-empty');
  await page.getByRole('link', { name: 'Сбросить фильтры', exact: true }).click();
  await expect(page.locator('.project-card').first()).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
});

test('navigation: keyboard opens menu and Escape restores focus', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('button.mobile-menu');
  if (await toggle.isVisible()) {
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link').first(),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  } else {
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link')
      .first()
      .focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/projects$/);
  }
});
