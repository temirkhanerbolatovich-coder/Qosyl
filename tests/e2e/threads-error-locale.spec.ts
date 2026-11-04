import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInDemo } from '../ui-quality/demo-session';

async function language(page: Page, locale: 'ru' | 'kk') {
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('header .locale-switch select').selectOption(locale);
  if (await menu.isVisible()) await menu.click();
}

test('malformed Threads status is a localized failure and does not enable search', async ({
  page,
}) => {
  await signInDemo(page, 'admin');
  await page.route('**/api/admin/leads/threads', (route) =>
    route.fulfill({ json: { data: { enabled: 'private-schema-marker' } } }),
  );
  await page.goto('/admin');
  await page.locator('.admin-tabs button').first().click();
  await language(page, 'kk');
  const panel = page.getByRole('region', { name: 'Threads ішінен іздеу', exact: true });
  await expect(panel.getByRole('alert')).toContainText(
    'Сервер жауабы Threads қосылымының күйін растамайды.',
  );
  await expect(panel.getByRole('alert')).not.toContainText('private-schema-marker');
  await expect(panel.locator('input[name=query]')).toBeDisabled();
});

test('Threads status failure keeps the server reason and changes language without another request', async ({
  page,
}) => {
  await signInDemo(page, 'admin');
  let requests = 0;
  await page.route('**/api/admin/leads/threads', async (route) => {
    requests++;
    await route.fulfill({
      status: 403,
      json: { error: 'Сначала подтвердите email.', code: 'FORBIDDEN' },
    });
  });
  await page.goto('/admin');
  await page.locator('.admin-tabs button').first().click();
  const panel = page.getByRole('region', { name: 'Поиск в Threads', exact: true });
  await expect(panel.getByRole('alert')).toContainText('Сначала подтвердите email.');
  const before = requests;
  await language(page, 'kk');
  await expect(
    page.getByRole('region', { name: 'Threads ішінен іздеу', exact: true }).getByRole('alert'),
  ).toContainText('Алдымен email мекенжайын растаңыз.');
  expect(requests).toBe(before);
  await expect(page.locator('input[name=query]')).toBeDisabled();
});

test('Threads search failures retranslate, preserve query and never expose schema diagnostics', async ({
  page,
}, info) => {
  await signInDemo(page, 'admin');
  let posts = 0;
  let mode: 'rate' | 'access' | 'invalid' | 'unknown' | 'network' = 'rate';
  await page.route('**/api/admin/leads/threads', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { data: { enabled: true, configured: true } } });
    posts++;
    if (mode === 'network') return route.abort();
    if (mode === 'invalid')
      return route.fulfill({ json: { data: { items: 'private-schema-marker' } } });
    return route.fulfill({
      status: mode === 'rate' ? 429 : 503,
      json: {
        error:
          mode === 'rate'
            ? 'Threads ограничил частоту. Повторите поиск после паузы.'
            : mode === 'access'
              ? 'Threads: проверьте срок токена и разрешение приложения на поиск.'
              : 'Неизвестный ответ: сохраните исходный текст',
        code: 'SERVICE_UNAVAILABLE',
      },
    });
  });
  await page.goto('/admin');
  await page.locator('.admin-tabs button').first().click();
  const query = page.locator('input[name=query]');
  await expect(query).toBeEnabled();
  await query.fill('Синтетический запрос без отправки провайдеру');
  let panel = page.getByRole('region', { name: 'Поиск в Threads', exact: true });
  await panel.getByRole('button', { name: 'Найти публикации', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Threads ограничил частоту.');
  await language(page, 'kk');
  panel = page.getByRole('region', { name: 'Threads ішінен іздеу', exact: true });
  await expect(panel.getByRole('alert')).toContainText('Threads сұрау жиілігін шектеді.');
  expect(posts).toBe(1);
  await expect(query).toHaveValue('Синтетический запрос без отправки провайдеру');
  for (const [next, expected] of [
    ['access', 'токен мерзімі'],
    ['invalid', 'қолдау көрсетілмейтін жауап'],
    ['unknown', 'Бастапқы хабарлама:'],
    ['network', 'Threads уақытша қолжетімсіз.'],
  ] as const) {
    mode = next;
    await panel.getByRole('button', { name: 'Жарияланымдарды табу', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText(expected);
    await expect(panel.getByRole('alert')).not.toContainText('private-schema-marker');
    if (mode === 'unknown')
      await expect(panel.getByRole('alert')).toContainText(
        'Неизвестный ответ: сохраните исходный текст',
      );
  }
  for (const width of [375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    const audit = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
    ).toEqual([]);
    await panel.screenshot({ path: info.outputPath(`threads-error-kk-${width}.png`) });
  }
});
