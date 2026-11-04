import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInDemo } from './demo-session';

test('profile headline is labelled and fits the existing themes and viewports', async ({
  page,
}, info) => {
  await signInDemo(page, 'student');
  await page.goto('/student/profile');
  const input = page.getByRole('textbox', {
    name: 'Профессиональный заголовок (необязательно)',
    exact: true,
  });
  await input.fill(
    'Начинающий специалист по аналитике данных и учебным исследованиям'.repeat(2).slice(0, 120),
  );
  await input.focus();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('maxlength', '120');
  await page.locator('[name="languages"]').fill('Қазақша, Русский, English');
  await page.getByRole('button', { name: 'Добавить ссылку', exact: true }).click();
  await page
    .getByRole('group', { name: 'Ссылка 1', exact: true })
    .getByLabel('HTTPS URL', { exact: true })
    .fill('https://example.com/portfolio');
  await page.getByRole('button', { name: 'Добавить опыт', exact: true }).click();
  const experience = page.getByRole('group', { name: 'Опыт 1', exact: true });
  await experience
    .getByLabel('Организация или проект', { exact: true })
    .fill('Учебный проект с длинным названием и описанием собственного вклада');
  await experience
    .getByLabel('Ваша роль', { exact: true })
    .fill('Исследователь и аналитик учебных данных');
  await experience
    .getByLabel('Задачи и личный вклад', { exact: true })
    .fill('Длинное описание учебной задачи. '.repeat(12));
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  const audit = await new AxeBuilder({ page }).analyze();
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  await info.attach('profile-headline-audit', {
    body: JSON.stringify({
      mode: 'enforced',
      layout,
      violations: audit.violations,
      incomplete: audit.incomplete,
    }),
    contentType: 'application/json',
  });
  expect(
    audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('profile-headline.png'), fullPage: true });
});
