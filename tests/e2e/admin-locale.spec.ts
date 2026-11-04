import {
  contentIntakeDataSchema,
  contentMutationDataSchema,
  contentDetailDataSchema,
} from '../../src/contracts/content-intake';
import { randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type APIRequestContext, type TestInfo } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';
import { parseDataResponse } from '../../src/contracts/api-response-validation';
import { commandDataSchemas, type CommandData } from '../../src/contracts/api-responses';
import type { Action } from '../../src/lib/validation';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
async function language(page: Page, locale: 'ru' | 'kk') {
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
  await page.locator('header .locale-switch select').selectOption(locale);
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'true')
    await menu.click();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}
async function command<A extends Action>(
  api: APIRequestContext,
  action: A,
  fields: Record<string, unknown>,
) {
  const response = await api.post('/api/platform', {
    headers: { Origin: baseURL },
    data: { action, ...fields },
  });
  expect(response.status(), action).toBe(200);
  return parseDataResponse(commandDataSchemas[action], await response.json())
    .data as CommandData<A>;
}
async function fixture(student: Page, client: Page, admin: Page) {
  const url = new URL(process.env.DATABASE_URL || 'invalid:');
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/student_marketplace_e2e_ui_[a-f0-9]{12}$/.test(url.pathname) ||
    process.env.E2E_EXTERNAL_SERVER
  )
    throw new Error('Only a managed isolated local database may receive F06e fixtures.');
  await signInDemo(student, 'student');
  await signInDemo(client, 'client');
  await signInDemo(admin, 'admin');
  const created = await command(client.request, 'createProject', {
    title: `ДЕМО F06e: неизменяемый исходный текст ${randomBytes(5).toString('hex')}`,
    category: 'spreadsheets',
    problem: 'Синтетическая проверка смены языка без потери данных.',
    description:
      'Только синтетические данные. Проверяем действия обеих сторон и неизменность исходного текста.',
    deliverables: 'Синтетический текстовый результат, без персональных данных.',
    acceptanceCriteria: ['Синтетический результат подготовлен.', 'Исходный текст сохранён.'],
    skills: ['Excel'],
    difficulty: 'beginner_friendly',
    mode: 'remote',
    city: '',
    locationPrivate: '',
    contactPrivate: '',
    budgetKzt: 5000,
    estimatedHours: 2,
    dueAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    preferredTime: '',
  });
  const projectId = created.id;
  await command(client.request, 'submitForModeration', { projectId });
  return projectId;
}
async function inspect(page: Page, info: TestInfo, name: string) {
  await expect(page).toHaveTitle(/\S/);
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                Number.isFinite(a.effect?.getComputedTiming().endTime) &&
                !['finished', 'idle'].includes(a.playState),
            ).length,
      ),
    )
    .toBe(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await info.attach(name + '-audit', {
    body: JSON.stringify({ overflow, violations: audit.violations }),
    contentType: 'application/json',
  });
  expect(overflow).toBe(false);
  expect(audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
    [],
  );
  await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true });
}

test('F06e: moderation, complaint decisions and cost drafts preserve state across locales', async ({
  page,
  browser,
}) => {
  const studentContext = await browser.newContext({ baseURL }),
    clientContext = await browser.newContext({ baseURL });
  const student = await studentContext.newPage(),
    client = await clientContext.newPage();
  try {
    const id = await fixture(student, client, page);
    for (const url of ['/api/platform?view=admin', '/api/admin/content', '/api/admin/leads'])
      expect((await student.request.get(url)).status()).toBe(403);
    await page.goto('/admin');
    await language(page, 'kk');
    const entry = page
      .locator('article')
      .filter({ has: page.locator(`a[href="/projects/${id}"]`) });
    await entry
      .locator('[name=reason]')
      .fill('Синтетическая проверка F06e без изменения исходных условий.');
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST') posts++;
    });
    await language(page, 'ru');
    await language(page, 'kk');
    await expect(entry.locator('[name=reason]')).toHaveValue(
      'Синтетическая проверка F06e без изменения исходных условий.',
    );
    expect(posts).toBe(0);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    await page.route('**/api/platform', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await gate;
      await route.fulfill({
        status: 503,
        json: { error: 'Synthetic moderation unavailable F06e.' },
      });
    });
    await entry.getByRole('button', { name: 'Мақұлдау', exact: true }).click();
    try {
      await expect(entry.getByRole('button', { name: 'Мақұлдау', exact: true })).toBeDisabled();
      await language(page, 'ru');
      await language(page, 'kk');
      expect(posts).toBe(1);
    } finally {
      release();
    }
    await expect(page.locator('main [role=alert]')).toContainText(
      'Synthetic moderation unavailable F06e.',
    );
    await page.unroute('**/api/platform');
    await entry.getByRole('button', { name: 'Мақұлдау', exact: true }).click();
    await expect(page.locator('main .alert.success')).toContainText('Тапсырыс жарияланды');
    await language(page, 'ru');
    await expect(page.locator('main .alert.success')).toContainText('Заказ опубликован');
    const complaint = await command(student.request, 'fileComplaint', {
      projectId: id,
      reason: 'Синтетическая жалоба F06e для проверки перевода решения.',
    });
    expect(complaint).toBeTruthy();
    await page.reload();
    await language(page, 'kk');
    await page.locator('.admin-tabs button').nth(6).click();
    const report = page
      .locator('article')
      .filter({ hasText: 'Синтетическая жалоба F06e для проверки перевода решения.' });
    await report
      .locator('[name=resolution]')
      .fill('Синтетическое решение F06e: исходный текст сохраняется.');
    const before = posts;
    await language(page, 'ru');
    await language(page, 'kk');
    expect(posts).toBe(before);
    await expect(report.locator('[name=resolution]')).toHaveValue(
      'Синтетическое решение F06e: исходный текст сохраняется.',
    );
    await report.getByRole('button', { name: 'Шешімді сақтау', exact: true }).click();
    await expect(page.locator('main .alert.success')).toContainText('Өтініш қаралды');
    await page.locator('.admin-tabs button').nth(3).click();
    const costs = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Пилот шығындарының журналы', exact: true }),
    });
    const form = costs.locator('form').first();
    await form.locator('[name=occurredAt]').fill('2026-10-27T12:00');
    await form.locator('[name=minutes]').fill('3');
    await form.locator('[name=amountKzt]').fill('5');
    const description = `Синтетическая запись затрат F06e ${id}`;
    await form.locator('[name=description]').fill(description);
    const fields = await form.evaluate((f: HTMLFormElement) => [...new FormData(f).entries()]);
    const beforeCost = posts;
    await language(page, 'ru');
    await language(page, 'kk');
    expect(posts).toBe(beforeCost);
    expect(await form.evaluate((f: HTMLFormElement) => [...new FormData(f).entries()])).toEqual(
      fields,
    );
    await form.getByRole('button', { name: 'Шығынды сақтау', exact: true }).click();
    await expect(costs.locator('.alert.success')).toContainText('Шығын сақталды');
    const saved = costs.locator('article').filter({ hasText: description });
    await saved.getByRole('button', { name: 'Қате жазбаның күшін жою', exact: true }).click();
    await saved
      .locator('[name=reason]')
      .fill('Синтетическая отмена после проверки интерфейса F06e.');
    await language(page, 'ru');
    await language(page, 'kk');
    await expect(saved.locator('[name=reason]')).toHaveValue(
      'Синтетическая отмена после проверки интерфейса F06e.',
    );
    await saved.getByRole('button', { name: 'Жазбаның күшін жоюды растау', exact: true }).click();
    await expect(costs.locator('.alert.success')).toContainText('Жазбаның күші жойылды');
    await page.reload();
    await page.locator('.admin-tabs button').nth(8).click();
    await expect(page.locator('main')).toContainText('Пилот шығындары тіркелді');
    await expect(page.locator('main')).toContainText('Шығын жазбасының күші жойылды');
    await expect(page.locator('main')).toContainText('Тапсырыс мақұлданды');
    await language(page, 'ru');
    await expect(page.locator('main')).toContainText('Запись затрат отменена');
  } finally {
    await studentContext.close();
    await clientContext.close();
  }
});

test('F06e: editorial filters, unsaved revision, review and selected history survive RU/KK', async ({
  page,
}, info) => {
  await signInDemo(page, 'admin');
  const original = await page.request.get('/api/admin/content');
  const before = parseDataResponse(contentIntakeDataSchema, await original.json()).data;
  async function change(action: string, fields: Record<string, unknown>) {
    const response = await page.request.post('/api/admin/content', {
      headers: { Origin: baseURL },
      data: { action, ...fields },
    });
    expect(response.status(), action).toBe(200);
    return parseDataResponse(contentMutationDataSchema, await response.json()).data;
  }
  const source = await change('createSource', {
    name: `Синтетический F06e ${randomBytes(4).toString('hex')}`,
    type: 'manual',
    allowedHost: 'example.org',
    rightsNote: 'Синтетический источник только для изолированной проверки.',
    enabled: true,
  });
  if (!('sourceId' in source)) throw new Error('Source required');
  try {
    await change('setModuleEnabled', { enabled: true });
    const title = `Исходная возможность F06e ${randomBytes(4).toString('hex')}`;
    const item = await change('addManualContent', {
      sourceId: source.sourceId,
      url: `https://example.org/f06e/${randomBytes(5).toString('hex')}`,
      title,
      summary: 'Синтетический анонс для проверки неизменности исходного текста.',
      category: 'event',
      language: 'ru',
    });
    if (!('itemId' in item)) throw new Error('Item required');
    await page.goto('/admin');
    await language(page, 'kk');
    await page.locator('.admin-tabs button').nth(1).click();
    const panel = page.locator('.content-intake');
    await panel
      .locator('article')
      .filter({ hasText: title })
      .getByRole('button', { name: 'Тексеру және тарихты ашу', exact: true })
      .click();
    const editor = page.locator('.content-editor');
    const review = editor.locator('form').first();
    await review.locator('[name=reason]').fill('Синтетическая проверка оригинала и условий F06e.');
    await editor
      .locator('summary')
      .filter({ hasText: 'Жариялау алдында материалды түзету' })
      .click();
    const edit = editor.locator('form').nth(1);
    await edit.locator('[name=title]').fill(title + ' — неотправленная правка');
    await edit.locator('[name=reason]').fill('Несохранённое объяснение правки F06e.');
    await editor.locator('summary').filter({ hasText: 'Редакциялар тарихы' }).click();
    const historyValues = await editor
      .locator('details select')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLSelectElement).value));
    const fields = await edit.evaluate((f: HTMLFormElement) => [...new FormData(f).entries()]);
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST') posts++;
    });
    await language(page, 'ru');
    await language(page, 'kk');
    expect(posts).toBe(0);
    expect(await edit.evaluate((f: HTMLFormElement) => [...new FormData(f).entries()])).toEqual(
      fields,
    );
    expect(
      await editor
        .locator('details select')
        .evaluateAll((nodes) => nodes.map((n) => (n as HTMLSelectElement).value)),
    ).toEqual(historyValues);
    await expect(editor.locator('details[open]')).toHaveCount(2);
    await review.getByRole('button', { name: 'Шешімді сақтау', exact: true }).click();
    await expect(editor.locator('.alert.success')).toContainText('Шешім журналға жазылды');
    const detailResponse = await page.request.get(`/api/admin/content/${item.itemId}`);
    const detail = parseDataResponse(contentDetailDataSchema, await detailResponse.json()).data;
    expect(detail.item.status).toBe('published');
    expect(detail.item.revisions[0].title).toBe(title);
    await language(page, 'ru');
    await expect(editor.locator('.alert.success')).toContainText(
      'Сохранено. Решение записано в журнал.',
    );
    await language(page, 'kk');
    await page.setViewportSize({ width: 375, height: 1000 });
    await inspect(page, info, 'editor-kk-375');
    const search = panel.locator('form').filter({ has: page.locator('[name=q]') });
    await search.locator('[name=q]').fill('Неотправленный фильтр F06e');
    const requestCount = posts;
    await language(page, 'ru');
    await language(page, 'kk');
    expect(posts).toBe(requestCount);
    await expect(search.locator('[name=q]')).toHaveValue('Неотправленный фильтр F06e');
  } finally {
    await change('setSourceEnabled', { sourceId: source.sourceId, enabled: false });
    await change('setModuleEnabled', { enabled: before.settings.enabled });
  }
});

test('F06e: private lead action and synthetic Threads results retain state and original text', async ({
  page,
}, info) => {
  await signInDemo(page, 'admin');
  const candidate = {
    externalId: '123456789',
    sourceUrl: 'https://www.threads.com/@fixture/post/F06e',
    sourceName: 'Threads @fixture',
    title: 'Синтетический кандидат F06e',
    summary: 'Синтетическая потребность F06e, без контактов и реального заказчика.',
    publishedAt: '2026-10-25T12:00:00.000Z',
  };
  await page.route('**/api/admin/leads/threads', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'GET'
          ? { data: { enabled: true, configured: true } }
          : { data: { items: [candidate], discarded: 2, searchType: 'RECENT', limited: true } },
    }),
  );
  await page.goto('/admin');
  await language(page, 'kk');
  await page.locator('.admin-tabs button').first().click();
  const search = page.getByRole('region', { name: 'Threads ішінен іздеу', exact: true });
  await search.locator('[name=query]').fill('Синтетическая тема');
  await search.getByRole('button', { name: 'Жарияланымдарды табу', exact: true }).click();
  await expect(search.locator('.alert.success')).toContainText(
    'Табылған үміткерлер: 1. Алынып тасталғаны: 2.',
  );
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST') posts++;
  });
  await language(page, 'ru');
  await expect(page.locator('section[aria-label="Поиск в Threads"] .alert.success')).toContainText(
    'Найдено кандидатов: 1. Отброшено: 2.',
  );
  await language(page, 'kk');
  expect(posts).toBe(0);
  const form = page.locator('form').filter({ has: page.locator('[name=sourceUrl]') });
  await form.locator('[name=title]').fill('Несохранённый заголовок F06e');
  await search
    .getByRole('button', { name: 'Үміткердің бос формасын толтыру', exact: true })
    .click();
  await expect(form.locator('[name=title]')).toHaveValue('Несохранённый заголовок F06e');
  await form.getByRole('button', { name: 'Форманы тазалау', exact: true }).click();
  await search
    .getByRole('button', { name: 'Үміткердің бос формасын толтыру', exact: true })
    .click();
  await form.locator('[name=assignedToId]').selectOption('demo-admin');
  const fields = await form.evaluate((f: HTMLFormElement) => [...new FormData(f).entries()]);
  await language(page, 'ru');
  await language(page, 'kk');
  expect(posts).toBe(0);
  expect(await form.evaluate((f: HTMLFormElement) => [...new FormData(f).entries()])).toEqual(
    fields,
  );
  await form.getByRole('button', { name: 'Жабық тізілімге қосу', exact: true }).click();
  const record = page.locator('.content-editor');
  await expect(record.getByRole('heading', { name: candidate.title, exact: true })).toBeVisible();
  const action = record.locator('form');
  await action.locator('[name=action]').selectOption('editLead');
  await action.locator('[name=title]').fill(candidate.title + ' — черновик');
  await action.locator('[name=reason]').fill('Неотправленная заметка F06e с исходным текстом.');
  const draft = await action.evaluate((f: HTMLFormElement) => [...new FormData(f).entries()]);
  const savedCount = posts;
  await language(page, 'ru');
  await language(page, 'kk');
  expect(posts).toBe(savedCount);
  expect(await action.evaluate((f: HTMLFormElement) => [...new FormData(f).entries()])).toEqual(
    draft,
  );
  await action.locator('[name=action]').selectOption('addLeadNote');
  await action.getByRole('button', { name: 'Әрекетті тіркеу', exact: true }).click();
  await expect(record.locator('.alert.success')).toContainText('Әрекет тарихқа жазылды');
  await page.setViewportSize({ width: 768, height: 1000 });
  await inspect(page, info, 'lead-kk-768');
});

test('F06e: all nine admin tabs in both languages and themes across four widths', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await signInDemo(page, 'admin');
  await page.goto('/admin');
  let i = 0;
  for (const locale of ['ru', 'kk'] as const)
    for (const theme of ['light', 'dark'])
      for (let tab = 0; tab < 9; tab++) {
        const width = [375, 768, 1440, 1920][i++ % 4];
        await page.setViewportSize({ width, height: 1000 });
        await language(page, locale);
        const menu = page.locator('header button[aria-controls="header-navigation"]');
        if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
          await menu.click();
        await page.locator('header .theme-switch:not(.locale-switch) select').selectOption(theme);
        if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'true')
          await menu.click();
        await page.locator('.admin-tabs button').nth(tab).click();
        await expect(page.locator('main .loading-skeleton')).toHaveCount(0);
        await inspect(page, info, `tab-${tab}-${locale}-${theme}-${width}`);
      }
});
