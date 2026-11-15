import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInDemo } from './demo-session';

test('client application count is localized and usable by keyboard', async ({ page }, info) => {
  await signInDemo(page, 'client');
  await page.goto('/dashboard');

  const emptyCount = page.getByRole('link', { name: 'Откликов пока нет', exact: true }).first();
  await expect(emptyCount).toBeVisible();
  const applicationsUrl = await emptyCount.getAttribute('href');
  expect(applicationsUrl).toMatch(/^\/client\/projects\/[^/]+\/applications$/);
  const projectRow = page.locator('article.project-row').filter({
    has: page.locator(`a[href="${applicationsUrl}"]`),
  });
  const projectTitle = projectRow.locator('a.row-title');

  const menu = page.locator('button[aria-controls="header-navigation"]');
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
  await page.locator('.locale-switch select').selectOption('kk');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  if (await menu.isVisible()) await menu.click();

  const translatedCount = projectRow.getByRole('link', {
    name: 'Әзірге өтінімдер жоқ',
    exact: true,
  });
  await expect(translatedCount).toBeVisible();
  await expect(translatedCount).toHaveAttribute('href', applicationsUrl!);
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const baselineOnly = process.env.UI_QUALITY_BASELINE === 'true';
  await info.attach('application-count-audit', {
    body: JSON.stringify({
      mode: baselineOnly ? 'observation' : 'enforced',
      layout,
      violations: audit.violations,
      incomplete: audit.incomplete,
    }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('application-count-kk.png'), fullPage: true });
  if (!baselineOnly) {
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
    expect(
      audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
    ).toEqual([]);
  }

  await projectTitle.focus();
  await page.keyboard.press('Tab');
  await expect(translatedCount).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL((url) => url.pathname === applicationsUrl);
});
