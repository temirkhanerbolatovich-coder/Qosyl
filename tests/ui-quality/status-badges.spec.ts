import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { signInDemo } from './demo-session';

const projectStatuses = [
  ['draft', 'neutral', 'Черновик', 'Жоба нұсқасы'],
  ['pending_moderation', 'info', 'На модерации', 'Модерацияда'],
  ['published', 'success', 'Открыт для откликов', 'Өтінімдер қабылданады'],
  ['paused', 'neutral', 'Приостановлен', 'Уақытша тоқтатылған'],
  ['assigned', 'info', 'Согласование условий', 'Шарттарды келісу'],
  ['in_progress', 'progress', 'В работе', 'Орындалып жатыр'],
  ['submitted', 'progress', 'На приёмке', 'Қабылдауды күтуде'],
  ['changes_requested', 'attention', 'Нужны правки', 'Түзету қажет'],
  ['accepted', 'success', 'Результат принят', 'Нәтиже қабылданды'],
  ['completed', 'success', 'Завершён', 'Аяқталған'],
  ['cancelled', 'neutral', 'Отменён', 'Бас тартылған'],
  ['disputed', 'attention', 'Открыт спор', 'Дау ашылған'],
  ['expired', 'neutral', 'Срок истёк', 'Мерзімі өткен'],
] as const;

const applicationStatuses = [
  ['active', 'info', 'На рассмотрении', 'Қаралуда'],
  ['withdrawn', 'neutral', 'Отклик отозван', 'Өтінім қайтарылды'],
  ['selected', 'success', 'Вы выбраны', 'Сіз таңдалдыңыз'],
  ['not_selected', 'neutral', 'Не выбран', 'Таңдалмады'],
] as const;

async function chooseLanguage(page: Page, locale: 'ru' | 'kk') {
  const menu = page.locator('button[aria-controls="header-navigation"]');
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
  await page.locator('.locale-switch select').selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  if (await menu.isVisible()) await menu.click();
}

async function checkBadge(badge: Locator, tone: string, text: string) {
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-tone', tone);
  await expect(badge).toHaveText(text);
  await expect(badge.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  const contrast = await badge.evaluate((element) => {
    const style = getComputedStyle(element);
    function luminance(color: string) {
      const values = color
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      if (!values || values.length !== 3) throw new Error(`Unexpected computed color: ${color}`);
      const channels = values.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    const first = luminance(style.color);
    const second = luminance(style.backgroundColor);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  });
  expect(contrast, `Text contrast for ${text}`).toBeGreaterThanOrEqual(4.5);
}

async function auditPage(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const baselineOnly = process.env.UI_QUALITY_BASELINE === 'true';
  await info.attach(`${name}-audit`, {
    body: JSON.stringify({ mode: baselineOnly ? 'observation' : 'enforced', layout, ...audit }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  if (!baselineOnly) {
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
    expect(
      audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
    ).toEqual([]);
  }
}

test('project statuses show distinct tones and readable RU/KK labels', async ({ page }, info) => {
  await signInDemo(page, 'client');
  await page.route('**/api/platform?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'dashboard')
      return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const template = body.data.projects[0];
    if (!template) throw new Error('The isolated client demo has no project template');
    body.data.projects = projectStatuses.map(([status]) => ({
      ...template,
      id: `test-status-${status}`,
      title: `ТЕСТ ${status}`,
      status,
    }));
    return route.fulfill({ response, json: body });
  });
  await page.goto('/client/projects');
  for (const [status, tone, russian] of projectStatuses) {
    const badge = page
      .locator('article.project-row')
      .filter({ hasText: `ТЕСТ ${status}` })
      .locator('.badge.status');
    await checkBadge(badge, tone, russian);
    if (status === 'changes_requested')
      await expect(badge).toHaveAttribute('data-severity', 'warning');
    if (status === 'disputed') await expect(badge).toHaveAttribute('data-severity', 'error');
  }
  await auditPage(page, info, 'project-statuses-ru');
  await chooseLanguage(page, 'kk');
  for (const [status, tone, , kazakh] of projectStatuses) {
    const badge = page
      .locator('article.project-row')
      .filter({ hasText: `ТЕСТ ${status}` })
      .locator('.badge.status');
    await checkBadge(badge, tone, kazakh);
  }
  await auditPage(page, info, 'project-statuses-kk');
});

test('application statuses show localized labels, icons and tones', async ({ page }, info) => {
  await signInDemo(page, 'student');
  const catalogue = await (await page.request.get('/api/platform?view=catalog')).json();
  const project = catalogue.data.projects[0];
  if (!project) throw new Error('The isolated catalogue has no demo project template');
  await page.route('**/api/platform?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'dashboard')
      return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.data.applications = applicationStatuses.map(([status]) => ({
      id: `test-application-${status}`,
      projectId: project.id,
      studentId: body.data.user.id,
      message: `ТЕСТ ${status}`,
      links: [],
      status,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
      project,
    }));
    return route.fulfill({ response, json: body });
  });
  await page.goto('/student/applications');
  for (const [status, tone, russian] of applicationStatuses) {
    const badge = page
      .locator('article.project-row')
      .filter({ hasText: `ТЕСТ ${status}` })
      .locator('.badge.status');
    await checkBadge(badge, tone, russian);
  }
  await auditPage(page, info, 'application-statuses-ru');
  await chooseLanguage(page, 'kk');
  for (const [status, tone, , kazakh] of applicationStatuses) {
    const badge = page
      .locator('article.project-row')
      .filter({ hasText: `ТЕСТ ${status}` })
      .locator('.badge.status');
    await checkBadge(badge, tone, kazakh);
  }
  await auditPage(page, info, 'application-statuses-kk');
});
