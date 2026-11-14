import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('admissions guide is public, navigable and localized', async ({ page }, info) => {
  await page.goto('/admissions');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Готовимся к поступлению' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Госуслуга/ })).toHaveAttribute(
    'href',
    'https://www.gov.kz/services/3098',
  );
  await expect(page.getByRole('link', { name: /Условия MIT/ })).toHaveAttribute(
    'href',
    'https://mitadmissions.org/apply/firstyear/portfolios-additional-material/',
  );
  await page.getByRole('link', { name: 'Чек-лист', exact: true }).click();
  const checkbox = page.getByRole('checkbox').first();
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  const menu = page.locator('button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('.locale-switch select').selectOption('kk');
  if (await menu.isVisible()) await menu.click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Оқуға түсуге дайындық' }),
  ).toBeVisible();
  await expect(checkbox).toBeChecked();
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.screenshot({ path: info.outputPath('admissions.png'), fullPage: true });
});
