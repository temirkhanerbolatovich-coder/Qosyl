import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInDemo } from './demo-session';
test('case editor preserves tab and locale drafts and fits every viewport', async ({
  page,
}, info) => {
  await signInDemo(page, 'student');
  await page.goto('/student/profile');
  await page.getByRole('tab', { name: 'Профиль', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Портфолио', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Добавить кейс', exact: true }).click();
  const form = page.locator('form[aria-label]');
  const title = 'Учебный проект — исследование доступности интерфейса '.repeat(3).slice(0, 150);
  await form.locator('[name="title"]').fill(title);
  await form
    .locator('[name="contribution"]')
    .fill('Самостоятельный вклад без раскрытия закрытых материалов. '.repeat(20));
  await form.locator('[name="visibility"]').selectOption('public');
  await form.getByRole('button', { name: 'Сохранить кейс', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Портфолио', exact: true }).getByRole('alert'),
  ).toContainText('разрешение публикации');
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await page.getByRole('tab', { name: 'Портфолио', exact: true }).click();
  await expect(form.locator('[name="title"]')).toHaveValue(title);
  await page.getByRole('combobox', { name: 'Язык интерфейса' }).selectOption('kk');
  await expect(form.locator('[name="title"]')).toHaveValue(title);
  await expect(form.getByRole('button', { name: 'Кейсті сақтау', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const audit = await new AxeBuilder({ page }).analyze();
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  await info.attach('portfolio-audit', {
    body: JSON.stringify({
      mode: 'enforced',
      layout,
      violations: audit.violations,
      incomplete: audit.incomplete,
    }),
    contentType: 'application/json',
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(audit.violations.filter((i) => ['serious', 'critical'].includes(i.impact ?? ''))).toEqual(
    [],
  );
  await page.screenshot({ path: info.outputPath('portfolio.png'), fullPage: true });
});
