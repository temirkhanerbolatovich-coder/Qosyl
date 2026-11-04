import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';

async function readDraft(page: Page) {
  return page
    .locator('form')
    .evaluate((form) => Object.fromEntries(new FormData(form as HTMLFormElement)));
}

async function inspectTemplateForm(
  page: Page,
  info: TestInfo,
  theme: 'light' | 'dark',
  width: number,
) {
  await page.bringToFront();
  await page.setViewportSize({ width, height: 900 });
  const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('combobox', { name: 'Тема оформления', exact: true }).selectOption(theme);
  const close = page.getByRole('button', { name: 'Закрыть меню', exact: true });
  if (await close.isVisible()) await close.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // Inspect the current finite transitions with a bounded wait rather than captured promises.
  const settlingState = () =>
    page.evaluate(() => {
      const background = getComputedStyle(document.body).backgroundColor;
      return {
        theme: document.documentElement.dataset.theme,
        visibility: document.visibilityState,
        fontStatus: document.fonts.status,
        background,
        finiteAnimations: document
          .getAnimations()
          .filter(
            (animation) =>
              Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
              animation.playState !== 'finished' &&
              animation.playState !== 'idle',
          )
          .map((animation) => ({
            playState: animation.playState,
            currentTime: animation.currentTime,
            endTime: animation.effect?.getComputedTiming().endTime,
            target:
              animation.effect instanceof KeyframeEffect &&
              animation.effect.target instanceof Element
                ? animation.effect.target.outerHTML.slice(0, 160)
                : null,
          })),
      };
    });
  try {
    await expect
      .poll(settlingState, {
        timeout: 10000,
        message: `F05 template ${theme}/${width}: page visibility, font load or finite theme transition did not settle`,
      })
      .toMatchObject({ theme, visibility: 'visible', fontStatus: 'loaded', finiteAnimations: [] });
  } catch (error) {
    await info.attach(`templates-${theme}-${width}-settling-failure`, {
      body: JSON.stringify(await settlingState().catch(() => ({ pageUnavailable: true }))),
      contentType: 'application/json',
    });
    throw error;
  }
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await info.attach(`templates-${theme}-${width}-audit`, {
    body: JSON.stringify({ layout, violations: audit.violations, incomplete: audit.incomplete }),
    contentType: 'application/json',
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(
    audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`templates-${theme}-${width}.png`),
    fullPage: true,
  });
  await page.getByRole('region', { name: 'Шаблоны задач', exact: true }).screenshot({
    path: info.outputPath(`templates-panel-${theme}-${width}.png`),
  });
}

test('F05: предпросмотр восьми шаблонов и применение без потери своего ввода', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await signInDemo(page, 'client');
  const mutations: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && (path === '/api/platform' || path === '/api/leads'))
      mutations.push(path);
  });
  await page.goto('/client/projects/new');
  await expect(
    page.getByRole('heading', { name: 'Новая задача для студента', exact: true }),
  ).toBeVisible();
  const templates = page.getByRole('region', { name: 'Шаблоны задач', exact: true });
  const select = templates.getByRole('combobox', { name: 'Шаблон задачи', exact: true });
  await expect(select.locator('option')).toHaveCount(9);
  const title = page.locator('[name=title]');
  const description = page.locator('textarea[name=description]');
  const hours = page.locator('[name=estimatedHours]');
  const ownTitle = 'Менің тапсырмам: проверить готовый учебный материал';
  const ownDescription =
    'Мой согласованный объём: работаем только с предоставленным учебным материалом.';
  await title.fill(ownTitle);
  await description.fill(ownDescription);
  await hours.fill('12');
  const initial = await readDraft(page);
  await expect(
    templates.getByRole('region', { name: 'Предпросмотр шаблона', exact: true }),
  ).toHaveCount(0);

  for (const [id, specialty, heading] of [
    ['spreadsheet', 'Экономика, бизнес и право', 'Сводная таблица до 100 строк'],
    ['presentation', 'Языки, культура, дизайн и медиа', 'Презентация до 5 слайдов'],
    ['static-page', 'IT и цифровые технологии', 'Информационная веб-страница'],
    ['drawing-index', 'Инженерия и строительство', 'Реестр обозначений одного чертежа'],
    ['learning-quiz', 'Педагогика', 'Учебный тест из 10 вопросов'],
    ['health-resources', 'Медицина и здоровье', 'Указатель материалов о здоровье'],
    ['field-observation-log', 'Сельское хозяйство', 'Журнал учебных агронаблюдений'],
    ['guest-guide', 'Туризм и сервис', 'Памятка гостя до двух страниц'],
  ]) {
    await expect(select.locator(`option[value="${id}"]`)).toContainText(specialty);
    await select.selectOption(id);
    const preview = templates.getByRole('region', { name: 'Предпросмотр шаблона', exact: true });
    await expect(preview.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(await readDraft(page)).toEqual(initial);
  }

  await select.selectOption('learning-quiz');
  const apply = templates.getByRole('button', { name: 'Заполнить пустые поля', exact: true });
  await apply.focus();
  await apply.press('Enter');
  await expect(page.getByRole('status')).toContainText('Шаблон добавлен только в пустые поля');
  await expect(title).toHaveValue(ownTitle);
  await expect(description).toHaveValue(ownDescription);
  await expect(hours).toHaveValue('12');
  await expect(page.locator('[name=category]')).toHaveValue('writing');
  expect(await page.locator('[name=deliverables]').inputValue()).toContain('10 вопросами');
  expect((await page.locator('[name=acceptanceCriteria]').inputValue()).split('\n')).toHaveLength(
    4,
  );
  for (const name of ['budgetKzt', 'dueAt', 'contactPrivate'])
    await expect(page.locator(`[name=${name}]`)).toHaveValue('');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  const applied = await readDraft(page);
  await select.selectOption('health-resources');
  await apply.click();
  await expect(page.getByRole('status')).toContainText('Пустых полей для шаблона нет');
  expect(await readDraft(page)).toEqual(applied);
  await select.selectOption('learning-quiz');
  for (const theme of ['light', 'dark'] as const)
    for (const width of [375, 768, 1440, 1920]) await inspectTemplateForm(page, info, theme, width);
  expect(mutations).toEqual([]);
  await expect(page).toHaveURL(/\/client\/projects\/new$/);
});
