import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { signInDemo } from './demo-session';

const baselineOnly = process.env.UI_QUALITY_BASELINE === 'true';

test('project detail: public task conditions', async ({ page }, testInfo) => {
  await page.goto('/projects');
  await expect(page.locator('.project-card h2 a').first()).toBeVisible();
  await page.locator('.project-card h2 a').first().click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await inspect(page, testInfo, 'project-detail');
});

async function inspect(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('.loading-skeleton')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    headings: [...document.querySelectorAll('h1')].map((heading) => heading.textContent),
    theme: document.documentElement.dataset.theme,
    background: getComputedStyle(document.body).backgroundColor,
  }));
  await testInfo.attach(`${name}-audit`, {
    body: JSON.stringify(
      {
        mode: baselineOnly ? 'observation' : 'enforced',
        layout,
        violations: axe.violations,
        incomplete: axe.incomplete,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  await page.screenshot({ path: testInfo.outputPath(`${name}-viewport.png`) });
  if (!baselineOnly) {
    expect(layout.documentWidth, 'Horizontal overflow').toBeLessThanOrEqual(layout.viewport + 1);
    expect(
      axe.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
      'Serious/critical axe findings; review audit attachment',
    ).toEqual([]);
  }
}

for (const [name, route] of [
  ['home', '/'],
  ['projects', '/projects'],
  ['opportunities', '/opportunities'],
  ['login', '/auth/login'],
] as const) {
  test(`${name}: layout, accessibility and screenshot`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedResponses: { path: string; status: number }[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && new URL(response.url()).origin === 'http://localhost:3100')
        failedResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    // Wait for the real catalogue response rather than a screenshot of its loading skeleton.
    if (name === 'home' || name === 'projects')
      await expect(page.getByText('Загрузка…', { exact: true })).toHaveCount(0);
    if (name === 'opportunities')
      await expect(page.getByRole('form', { name: 'Поиск возможностей' })).toBeVisible();
    if (name === 'login') {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();
    }
    await inspect(page, testInfo, name);
    await testInfo.attach('runtime', {
      body: JSON.stringify({ pageErrors, consoleErrors, failedResponses }),
      contentType: 'application/json',
    });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });
}

test('student dashboard: real seeded role and mobile navigation', async ({ page }, testInfo) => {
  await signInDemo(page, 'student');
  await page.goto('/dashboard');
  await expect(page.locator('main')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Открыть меню' });
  if (await menu.isVisible()) {
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
    await page.getByRole('link', { name: 'Мой кабинет', exact: true }).click();
  }
  await inspect(page, testInfo, 'student-dashboard');
});

for (const [name, role, route] of [
  ['client-dashboard', 'client', '/dashboard'],
  ['client-project-form', 'client', '/client/projects/new'],
  ['admin', 'admin', '/admin'],
] as const) {
  test(`${name}: existing role and screen`, async ({ page }, testInfo) => {
    await signInDemo(page, role);
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(route.replaceAll('/', '\\/') + '$'));
    await inspect(page, testInfo, name);
  });
}

test('theme: persistence, system changes and native keyboard control', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const expected = testInfo.project.name.endsWith('dark') ? 'dark' : 'light';
  await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
  const menu = page.getByRole('button', { name: 'Открыть меню' });
  if (await menu.isVisible()) await menu.click();
  const select = page.getByRole('combobox', { name: 'Тема оформления' });
  await select.focus();
  await expect(select).toBeFocused();
  await page.keyboard.press('Home');
  await expect(select).toHaveValue('light');
  await page.keyboard.press('End');
  await expect(select).toHaveValue('system');
  await select.selectOption(expected === 'dark' ? 'light' : 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    expected === 'dark' ? 'light' : 'dark',
  );
  const reopen = page.getByRole('button', { name: 'Открыть меню' });
  if (await reopen.isVisible()) await reopen.click();
  await page.getByRole('combobox', { name: 'Тема оформления' }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
