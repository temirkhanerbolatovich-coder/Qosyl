import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInDemo } from '../ui-quality/demo-session';

async function language(page: Page, locale: 'ru' | 'kk') {
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('header .locale-switch select').selectOption(locale);
  if (await menu.isVisible()) await menu.click();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

test('template preview follows language, applied draft remains untouched', async ({
  page,
}, info) => {
  await signInDemo(page, 'client');
  await page.goto('/client/projects/new');
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/api\/(platform|leads)$/.test(new URL(request.url()).pathname)
    )
      mutations.push(request.url());
  });
  await page.locator('input[name=title]').fill('Собственное название заказчика');
  const select = page
    .locator('select')
    .filter({ has: page.locator('option[value="learning-quiz"]') });
  await select.selectOption('learning-quiz');
  await expect(page.getByRole('heading', { name: 'Учебный тест из 10 вопросов' })).toBeVisible();
  await language(page, 'kk');
  await expect(page.getByRole('heading', { name: '10 сұрақтан тұратын оқу тесті' })).toBeVisible();
  await expect(page.locator('input[name=title]')).toHaveValue('Собственное название заказчика');
  for (const [id, title] of [
    ['spreadsheet', '100 жолға дейінгі жиынтық кесте'],
    ['presentation', '5 слайдқа дейінгі презентация'],
    ['static-page', 'Ақпараттық веб-бет'],
    ['drawing-index', 'Бір сызба белгілерінің тізілімі'],
    ['learning-quiz', '10 сұрақтан тұратын оқу тесті'],
    ['health-resources', 'Денсаулық материалдарының көрсеткіші'],
    ['field-observation-log', 'Оқу агробақылауларының журналы'],
    ['guest-guide', 'Екі бетке дейінгі қонақ жадынамасы'],
  ]) {
    await select.selectOption(id);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await select.selectOption('learning-quiz');
  for (const width of [375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({
      view: innerWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.view + 1);
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
    ).toEqual([]);
    await page
      .getByRole('region', { name: 'Тапсырма үлгілері' })
      .screenshot({ path: info.outputPath(`kk-template-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Бос өрістерді толтыру' }).click();
  const description = page.locator('textarea[name=description]');
  const applied = await description.inputValue();
  expect(applied).toContain('Бір түзету кезеңі');
  await expect(page.locator('[name=category]')).toHaveValue('writing');
  for (const name of ['budgetKzt', 'dueAt', 'contactPrivate'])
    await expect(page.locator(`[name=${name}]`)).toHaveValue('');
  await language(page, 'ru');
  await expect(page.getByRole('heading', { name: 'Учебный тест из 10 вопросов' })).toBeVisible();
  await expect(description).toHaveValue(applied);
  await expect(page.locator('input[name=title]')).toHaveValue('Собственное название заказчика');
  expect(mutations).toEqual([]);
});
