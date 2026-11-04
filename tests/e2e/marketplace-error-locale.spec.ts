import { expect, test } from '@playwright/test';

test('known server error changes language without another request; unknown detail stays original', async ({
  page,
}) => {
  let count = 0;
  let message = 'Срок заказа истек.';
  await page.route('**/api/platform?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'catalog')
      return route.continue();
    count++;
    await route.fulfill({ status: 409, json: { error: message, code: 'CONFLICT' } });
  });
  await page.goto('/projects');
  await expect(page.getByText('Срок заказа истек.', { exact: true })).toBeVisible();
  const countBeforeSwitch = count;
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('header .locale-switch select').selectOption('kk');
  if (await menu.isVisible()) await menu.click();
  await expect(page.getByText('Тапсырыстың мерзімі аяқталды.', { exact: true })).toBeVisible();
  expect(count).toBe(countBeforeSwitch);
  message = 'title: Слишком маленькое значение: ожидалось, что string будет иметь >=8 символов';
  await page.getByRole('button', { name: 'Қайталау' }).click();
  await expect(
    page.getByText('Тапсырма атауы: Кемінде 8 таңба енгізіңіз', { exact: true }),
  ).toBeVisible();
  message =
    'acceptanceCriteria.0: Слишком маленькое значение: ожидалось, что string будет иметь >=3 символа';
  await page.getByRole('button', { name: 'Қайталау' }).click();
  await expect(
    page.getByText('Қабылдау өлшемдері (1): Кемінде 3 таңба енгізіңіз', { exact: true }),
  ).toBeVisible();
  message = 'mode: Неверный вариант: ожидалось одно из "remote"|"onsite"|"hybrid"';
  await page.getByRole('button', { name: 'Қайталау' }).click();
  await expect(
    page.getByText('Жұмыс форматын қолжетімді нұсқалардан таңдаңыз', { exact: true }),
  ).toBeVisible();
  message = 'Файлы доступны после согласования условий обеими сторонами.';
  await page.getByRole('button', { name: 'Қайталау' }).click();
  await expect(
    page.getByText('Файлдар шарттарды екі тарап келіскеннен кейін қолжетімді.', { exact: true }),
  ).toBeVisible();
  message = 'Публиковать можно только материал на проверке.';
  await page.getByRole('button', { name: 'Қайталау' }).click();
  await expect(
    page.getByText('Тек тексерудегі материалды жариялауға болады.', { exact: true }),
  ).toBeVisible();
  message = 'Неизвестная причина: пример пользователя';
  await page.getByRole('button', { name: 'Қайталау' }).click();
  await expect(page.getByText(message, { exact: false })).toBeVisible();
  await expect(page.getByText('Бастапқы хабарлама:')).toBeVisible();
});
