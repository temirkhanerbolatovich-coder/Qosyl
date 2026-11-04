import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
async function header(page: Page, open: boolean) {
  const menu = page.locator('button[aria-controls="header-navigation"]');
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) !== String(open))
    await menu.click();
}
async function language(page: Page, locale: 'ru' | 'kk') {
  await header(page, true);
  await page.locator('header .locale-switch select').selectOption(locale);
  await header(page, false);
}
const routes = [
  {
    path: '/help',
    ru: 'Из понятной задачи — в реальный опыт',
    kk: 'Түсінікті тапсырмадан — нақты тәжірибеге',
  },
  { path: '/terms', ru: 'Понятные правила участия', kk: 'Қатысудың түсінікті ережелері' },
  { path: '/privacy', ru: 'Только данные, нужные для работы', kk: 'Тек жұмысқа қажетті деректер' },
  { path: '/missing-f06f-page', ru: 'Эта страница недоступна', kk: 'Бұл бет қолжетімсіз' },
];
async function inspect(page: Page, info: TestInfo, name: string) {
  await expect.poll(() => page.title()).not.toBe('');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
        .map((a) => a.finished.catch(() => {})),
    );
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await info.attach(name, {
    body: JSON.stringify({ overflow, violations: audit.violations }),
    contentType: 'application/json',
  });
  expect(overflow).toBe(false);
  expect(audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
    [],
  );
  await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true });
}
for (const route of routes)
  test(`F06f1: ${route.path} switches language and retains routes across widths and themes`, async ({
    page,
  }, info) => {
    await page.goto(route.path + '?from=locale-test');
    const links = await page
      .locator('main a')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')));
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST') posts++;
    });
    for (const width of [375, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await header(page, true);
        await page.locator('header .theme-switch:not(.locale-switch) select').selectOption(theme);
        await header(page, false);
        for (const locale of ['ru', 'kk'] as const) {
          await language(page, locale);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(route[locale]);
          if (route.path === '/help')
            await expect(page.locator('.help-step h2').first()).toHaveText(
              locale === 'kk' ? 'Өзіңізге сай тапсырма табыңыз' : 'Найдите подходящую задачу',
            );
          await expect(page.locator('main > div')).toHaveAttribute('lang', locale);
          await expect(page).toHaveURL(new RegExp(route.path + '\\?from=locale-test$'));
          expect(
            await page
              .locator('main a')
              .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href'))),
          ).toEqual(links);
          await inspect(page, info, `${locale}-${theme}-${width}`);
        }
      }
    }
    expect(posts).toBe(0);
  });
test('F06f1: Kazakh SSR, reload, safety limits and 404 recovery', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies([{ name: 'qosyl-locale', value: 'kk', url: 'http://localhost:3100' }]);
  const page = await context.newPage();
  try {
    await page.goto('/terms');
    await expect(page).toHaveTitle(/алғашқы нақты тәжірибе/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /Студенттерге арналған/,
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(routes[1].kk);
    await expect(page.locator('main')).toContainText('18+');
    await expect(page.locator('main')).toContainText(
      'кепілді төлем не жұмысқа орналасуға уәде бермейді',
    );
    await page.goto('/privacy');
    await expect(page.locator('main')).toContainText('5 МиБ');
    await expect(page.locator('main')).toContainText('антивирусты алмастырмайды');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(routes[2].kk);
    const response = await page.goto('/missing-f06f-page');
    expect(response?.status()).toBe(404);
    await page.getByRole('link', { name: 'Жобаларға оралу', exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await context.addCookies([
      { name: 'qosyl-locale', value: 'unknown', url: 'http://localhost:3100' },
    ]);
    await page.goto('/terms');
    await expect(page).toHaveTitle(/первый реальный опыт/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /Ограниченные по результату/,
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(routes[1].ru);
  } finally {
    await context.close();
  }
});
