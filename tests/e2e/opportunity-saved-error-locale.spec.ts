import { test, expect } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';

test('saved responses contain malformed JSON, schema and structured errors without repeating commands', async ({
  page,
}) => {
  await signInDemo(page, 'student');
  let mode: 'json' | 'structured' | 'valid' | 'refresh' = 'json',
    posts = 0;
  const data = {
    favorites: [],
    searches: [
      {
        id: 'synthetic-search',
        name: 'ДЕМО поиск',
        filters: {},
        createdAt: new Date().toISOString(),
        notificationFrequency: 'off',
        nextNotificationAt: null,
      },
    ],
  };
  await page.route('**/api/opportunities/saved', (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      if (mode === 'refresh') {
        mode = 'json';
        return route.fulfill({ json: { data: { saved: true } } });
      }
      return route.fulfill({ json: { data: { saved: 'private-marker' } } });
    }
    if (mode === 'json') return route.fulfill({ body: '<private-marker>' });
    if (mode === 'structured')
      return route.fulfill({ status: 500, json: { error: { internal: 'private-marker' } } });
    return route.fulfill({ json: { data } });
  });
  await page.goto('/opportunities/saved');
  const alert = page.locator('main').getByRole('alert');
  await expect(alert).toContainText('Не удалось прочитать сохранённое.');
  mode = 'structured';
  await alert.getByRole('button').click();
  await expect(alert).not.toContainText('[object Object]');
  await expect(alert).not.toContainText('private-marker');
  mode = 'valid';
  await alert.getByRole('button').click();
  await page.getByRole('button', { name: 'Удалить поиск', exact: true }).click();
  await expect(alert).toContainText('Ответ сервера не подтверждает сохранение.');
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('header .locale-switch select').selectOption('kk');
  if (await menu.isVisible()) await menu.click();
  await expect(alert).toContainText('Сервер жауабы сақтауды растамайды');
  expect(posts).toBe(1);
  mode = 'refresh';
  await page.getByRole('button', { name: 'Іздеуді жою', exact: true }).click();
  await expect(alert).toContainText('Өзгеріс сақталды, бірақ тізім жаңармады');
  expect(posts).toBe(2);
  mode = 'valid';
  await alert.getByRole('button').click();
  await expect(alert).toHaveCount(0);
  expect(posts).toBe(2);
});

test('saved-search errors switch language without retry and preserve unknown details', async ({
  page,
}) => {
  await signInDemo(page, 'student');
  let error = 'Можно сохранить до 20 поисков. Удалите ненужный поиск.';
  let status = 409;
  let requests = 0;
  await page.route('**/api/opportunities/saved', async (route) => {
    requests++;
    await route.fulfill({
      status,
      json: { error, code: status === 401 ? 'UNAUTHENTICATED' : 'CONFLICT' },
    });
  });
  await page.goto('/opportunities/saved');
  await expect(page.locator('main').getByRole('alert')).toContainText(error);
  const before = requests;
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('header .locale-switch select').selectOption('kk');
  if (await menu.isVisible()) await menu.click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    '20 іздеуге дейін сақтауға болады.',
  );
  expect(requests).toBe(before);
  error = 'Неизвестная причина: пример пользователя';
  await page.getByRole('button', { name: 'Сақталғандарды қайта жүктеу' }).click();
  const alert = page.locator('main').getByRole('alert');
  await expect(alert).toContainText('Бастапқы хабарлама:');
  await expect(alert).toContainText(error);
  await expect(alert.locator('span[lang="und"]')).toHaveText(error);
  error = 'Войдите в аккаунт.';
  status = 401;
  await page.getByRole('button', { name: 'Сақталғандарды қайта жүктеу' }).click();
  await expect(alert).toContainText('Аккаунтқа кіріңіз.');
  await expect(alert.getByRole('link', { name: 'Қайта кіру' })).toHaveAttribute(
    'href',
    '/auth/login',
  );
});
