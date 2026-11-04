import { expect, test } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';

test('notification setting load failure remains distinct and changes language', async ({
  page,
}) => {
  await signInDemo(page, 'student');
  let requests = 0;
  await page.route('**/api/notification-language', async (route) => {
    requests++;
    await route.fulfill({
      status: 503,
      json: { error: 'Синтетическая ошибка', code: 'SERVICE_UNAVAILABLE' },
    });
  });
  await page.goto('/dashboard');
  const alert = page.locator('main').getByRole('alert');
  await expect(alert).toContainText('Не удалось загрузить настройку.');
  const before = requests;
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('header .locale-switch select').selectOption('kk');
  if (await menu.isVisible()) await menu.click();
  await expect(alert).toContainText('Параметрді жүктеу мүмкін болмады.');
  expect(requests).toBe(before);
  await expect(page.getByLabel('Жаңа хабарламалар тілі')).toBeDisabled();
});

test('notification setting failures retain the draft and retranslate without retry', async ({
  page,
}) => {
  await signInDemo(page, 'student');
  let posts = 0;
  let status = 503;
  await page.route('**/api/notification-language', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { data: { language: 'ru' } } });
    posts++;
    return route.fulfill({
      status,
      json: { error: 'Синтетические внутренние сведения', code: 'SERVICE_UNAVAILABLE' },
    });
  });
  await page.goto('/dashboard');
  const selection = page.getByLabel('Язык новых уведомлений');
  await expect(selection).toBeEnabled();
  await selection.selectOption('kk');
  await page.getByRole('button', { name: 'Сохранить язык уведомлений' }).click();
  const alert = page.locator('main').getByRole('alert');
  await expect(alert).toContainText('Сохранение не подтверждено.');
  await expect(alert).not.toContainText('Синтетические внутренние сведения');
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('header .locale-switch select').selectOption('kk');
  if (await menu.isVisible()) await menu.click();
  await expect(alert).toContainText('Сақтау расталмады.');
  await expect(page.getByLabel('Жаңа хабарламалар тілі')).toHaveValue('kk');
  expect(posts).toBe(1);
  status = 401;
  await page.getByRole('button', { name: 'Хабарлама тілін сақтау' }).click();
  await expect(alert).toContainText('Сессия аяқталды.');
  await expect(alert.getByRole('link', { name: 'Кіру' })).toHaveAttribute('href', '/auth/login');
  await expect(page.getByLabel('Жаңа хабарламалар тілі')).toBeDisabled();
});
