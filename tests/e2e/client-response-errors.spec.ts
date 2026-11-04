import { randomBytes } from 'node:crypto';
import { mkdir, copyFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';
import { contentMutationDataSchema } from '../../src/contracts/content-intake';
import { leadListDataSchema, leadMutationDataSchema } from '../../src/contracts/leads';
import { parseDataResponse } from '../../src/contracts/api-response-validation';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const readError = 'Не удалось прочитать ответ сервера.';
const unconfirmed = 'Ответ сервера не подтверждает выполнение.';
const refreshError = 'Действие выполнено, но данные не обновились.';
async function language(page: Page, locale: 'ru' | 'kk') {
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('header .locale-switch select').selectOption(locale);
  if (await menu.isVisible()) await menu.click();
}
function isolatedFixturesOnly() {
  const url = new URL(process.env.DATABASE_URL || 'invalid:');
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/student_marketplace_e2e_ui_[a-f0-9]{12}$/.test(url.pathname)
  )
    throw new Error('Response fixtures require an isolated local E2E database.');
}
async function contentCommand(page: Page, action: string, fields: Record<string, unknown>) {
  isolatedFixturesOnly();
  const response = await page.request.post('/api/admin/content', {
    headers: { Origin: baseURL },
    data: { action, ...fields },
  });
  expect(response.status()).toBe(200);
  return parseDataResponse(contentMutationDataSchema, await response.json()).data;
}

for (const [tab, url] of [
  [0, '/api/admin/leads'],
  [1, '/api/admin/content'],
] as const) {
  test(`admin tab ${tab}: invalid JSON and schema stay recoverable and retranslate`, async ({
    page,
  }) => {
    await signInDemo(page, 'admin');
    let mode: 'json' | 'schema' | 'valid' = 'json',
      reads = 0;
    await page.route(`**${url}?*`, (route) => {
      reads++;
      if (mode === 'valid') return route.continue();
      return route.fulfill({
        contentType: 'application/json',
        body: mode === 'json' ? '<private-marker>' : '{"data":{"private-marker":true}}',
      });
    });
    await page.goto('/admin');
    await page.locator('.admin-tabs button').nth(tab).click();
    const alert = page.locator('main .empty-state');
    await expect(alert).toContainText(readError);
    const before = reads;
    await language(page, 'kk');
    await expect(alert).toContainText('Сервер жауабын оқу мүмкін болмады.');
    expect(reads).toBe(before);
    await language(page, 'ru');
    mode = 'schema';
    await page.locator('main').getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(alert).toContainText(readError);
    await expect(alert).not.toContainText('private-marker');
    mode = 'valid';
    await page.locator('main').getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(page.locator('.content-intake')).toBeVisible();
    await expect(alert).toHaveCount(0);
  });
}

test('lead creation keeps draft after unconfirmed write and committed refresh failure', async ({
  page,
}) => {
  await signInDemo(page, 'admin');
  let mode: 'invalid' | 'network' | 'confirmed' = 'invalid',
    failedRead = false,
    posts = 0;
  await page.route('**/api/admin/leads**', (route) => {
    if (route.request().method() === 'GET')
      return failedRead ? route.fulfill({ json: { data: null } }) : route.continue();
    posts++;
    if (mode === 'network') return route.abort();
    if (mode === 'confirmed') {
      failedRead = true;
      return route.fulfill({ json: { data: { leadId: 'synthetic', version: 1 } } });
    }
    return route.fulfill({ json: { data: { leadId: 'private-marker' } } });
  });
  await page.goto('/admin');
  await page.locator('.admin-tabs button').first().click();
  const form = page.locator('form[aria-label="Новый приватный материал"]');
  await form.locator('[name=sourceUrl]').fill('https://example.org/synthetic');
  await form.locator('[name=sourceName]').fill('Синтетический источник');
  await form.locator('[name=title]').fill('Несохранённый синтетический лид');
  await form
    .locator('[name=summary]')
    .fill('Синтетическое описание для проверки сохранности формы при ошибке ответа.');
  const operator = await form
    .locator('[name=assignedToId] option:not([disabled])')
    .first()
    .getAttribute('value');
  await form.locator('[name=assignedToId]').selectOption(operator!);
  const stableForm = page.locator('form').filter({ has: page.locator('[name=sourceUrl]') });
  const submit = () =>
    stableForm.locator('button[type=submit], button:not([type])').first().click();
  await submit();
  await expect(page.locator('main').getByRole('alert')).toContainText(unconfirmed);
  await language(page, 'kk');
  await expect(page.locator('main').getByRole('alert')).toContainText('орындалғанын растамайды');
  await expect(stableForm.locator('[name=title]')).toHaveValue('Несохранённый синтетический лид');
  expect(posts).toBe(1);
  await language(page, 'ru');
  mode = 'network';
  await submit();
  await expect(page.locator('main').getByRole('alert')).toContainText(unconfirmed);
  mode = 'confirmed';
  await submit();
  await expect(page.locator('main').getByRole('alert')).toContainText(refreshError);
  await expect(stableForm.locator('[name=title]')).toHaveValue('Несохранённый синтетический лид');
  expect(posts).toBe(3);
  failedRead = false;
  await page.getByRole('button', { name: 'Обновить реестр', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect(stableForm.locator('[name=title]')).toHaveValue('Несохранённый синтетический лид');
});

test('content command failure preserves source draft and distinguishes completed write', async ({
  page,
}) => {
  await signInDemo(page, 'admin');
  let confirmed = false,
    failedRead = false,
    posts = 0;
  await page.route('**/api/admin/content**', (route) => {
    if (route.request().method() === 'GET')
      return failedRead ? route.fulfill({ body: '<private-marker>' }) : route.continue();
    posts++;
    if (confirmed) failedRead = true;
    return route.fulfill({
      json: confirmed ? { data: { saved: true } } : { data: { saved: 'private-marker' } },
    });
  });
  await page.goto('/admin');
  await page.locator('.admin-tabs button').nth(1).click();
  await page
    .locator('form[aria-label="Добавление источника"] [name=name]')
    .fill('Черновик источника');
  const toggle = page.locator('.content-intake > .panel').first().locator('button').first();
  await toggle.click();
  await expect(page.locator('main').getByRole('alert')).toContainText(unconfirmed);
  confirmed = true;
  await toggle.click();
  await expect(page.locator('main').getByRole('alert')).toContainText(refreshError);
  await language(page, 'kk');
  await expect(page.locator('main').getByRole('alert')).toContainText('Әрекет орындалды');
  expect(posts).toBe(2);
  await expect(page.locator('input[name=name]')).toHaveValue('Черновик источника');
});

test('editor never exposes invalid detail and retains review draft on failed refresh', async ({
  page,
}, info) => {
  await signInDemo(page, 'admin');
  const title = `ДЕМО ответ редактора ${randomBytes(5).toString('hex')}`;
  const source = await contentCommand(page, 'createSource', {
    name: 'ДЕМО обработчик ответа',
    type: 'manual',
    allowedHost: 'example.org',
    rightsNote: 'Только синтетическая проверка интерфейса.',
    enabled: true,
  });
  if (!('sourceId' in source)) throw new Error('Source required');
  await contentCommand(page, 'setModuleEnabled', { enabled: true });
  const item = await contentCommand(page, 'addManualContent', {
    sourceId: source.sourceId,
    url: `https://example.org/response-${randomBytes(6).toString('hex')}`,
    title,
    summary: 'Синтетический материал для теста',
    category: 'event',
    language: 'ru',
  });
  if (!('itemId' in item)) throw new Error('Item required');
  let invalidDetail = true,
    confirmed = false,
    posts = 0;
  await page.route(`**/api/admin/content/${item.itemId}?*`, (route) =>
    invalidDetail
      ? route.fulfill({ json: { data: { item: 'private-marker' } } })
      : route.continue(),
  );
  await page.route('**/api/admin/content', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    posts++;
    if (confirmed) invalidDetail = true;
    return route.fulfill({
      json: confirmed ? { data: { saved: true } } : { data: { saved: 'private-marker' } },
    });
  });
  await page.goto('/admin');
  await page.locator('.admin-tabs button').nth(1).click();
  await page.locator('article').filter({ hasText: title }).getByRole('button').click();
  const editor = page.locator('section[aria-label="Редакционная проверка"]');
  await expect(editor).toContainText(readError);
  await expect(editor).not.toContainText('private-marker');
  invalidDetail = false;
  await editor.getByRole('button', { name: 'Обновить материал', exact: true }).click();
  const stableEditor = page.locator('.content-editor');
  const review = stableEditor.locator('form').first();
  await review
    .locator('[name=reason]')
    .fill('Синтетический черновик решения, который нужно сохранить.');
  await review.locator('[name=decision]').selectOption('reject');
  await review.locator('button').last().click();
  await expect(stableEditor.getByRole('alert')).toContainText(unconfirmed);
  confirmed = true;
  await review.locator('button').last().click();
  await expect(stableEditor.getByRole('alert')).toContainText(refreshError);
  await language(page, 'kk');
  await expect(stableEditor.getByRole('alert')).toContainText('Әрекет орындалды');
  await expect(review.locator('[name=reason]')).toHaveValue(
    'Синтетический черновик решения, который нужно сохранить.',
  );
  expect(posts).toBe(2);
  await mkdir('.local/f06-client-response-errors', { recursive: true });
  for (const width of [375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false,
    );
    const audit = await new AxeBuilder({ page }).include('main').analyze();
    expect(
      audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([]);
    await review.locator('[name=reason]').focus();
    await stableEditor.screenshot({
      path: `.local/f06-client-response-errors/editor-panel-kk-${width}.png`,
    });
    const path = info.outputPath(`editor-error-kk-${width}.png`);
    await page.screenshot({ path, fullPage: true });
    await copyFile(path, `.local/f06-client-response-errors/editor-error-kk-${width}.png`);
  }
  invalidDetail = false;
  await stableEditor.getByRole('button', { name: 'Материалды жаңарту', exact: true }).click();
  await expect(stableEditor.getByRole('alert')).toHaveCount(0);
  expect(posts).toBe(2);
});

test('lead record keeps action draft when confirmed command cannot refresh detail', async ({
  page,
}) => {
  await signInDemo(page, 'admin');
  isolatedFixturesOnly();
  const title = `ДЕМО обработчик карточки лида ${randomBytes(5).toString('hex')}`;
  const registry = parseDataResponse(
    leadListDataSchema,
    await (await page.request.get('/api/admin/leads')).json(),
  ).data;
  const response = await page.request.post('/api/admin/leads', {
    headers: { Origin: baseURL },
    data: {
      action: 'createLead',
      kind: 'discussion',
      sourceUrl: `https://example.org/lead-response-${randomBytes(6).toString('hex')}`,
      sourceName: 'Синтетический источник',
      title,
      summary: 'Только синтетическая проверка обработки ответа в приватном реестре.',
      assignedToId: registry.operators[0].id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  expect(response.status()).toBe(200);
  const saved = parseDataResponse(leadMutationDataSchema, await response.json()).data;
  let invalid = false,
    posts = 0;
  await page.route(`**/api/admin/leads/${saved.leadId}?*`, (route) =>
    invalid ? route.fulfill({ json: { data: null } }) : route.continue(),
  );
  await page.route('**/api/admin/leads', (route) => {
    if (route.request().method() === 'GET') return route.continue();
    posts++;
    invalid = true;
    return route.fulfill({ json: { data: { leadId: saved.leadId, version: 2 } } });
  });
  await page.goto('/admin');
  await page.locator('.admin-tabs button').first().click();
  await page.locator('article').filter({ hasText: title }).getByRole('button').click();
  const record = page.locator('.content-editor');
  const form = record.locator('form');
  await form.locator('[name=reason]').fill('Синтетическая заметка, сохраняемая при ошибке ответа.');
  await form.locator('button').last().click();
  await expect(record.getByRole('alert')).toContainText(refreshError);
  await language(page, 'kk');
  await expect(record.getByRole('alert')).toContainText('Әрекет орындалды');
  await expect(form.locator('[name=reason]')).toHaveValue(
    'Синтетическая заметка, сохраняемая при ошибке ответа.',
  );
  expect(posts).toBe(1);
  invalid = false;
  await record.getByRole('button', { name: 'Карточканы жаңарту', exact: true }).click();
  await expect(record.getByRole('alert')).toHaveCount(0);
  expect(posts).toBe(1);
});
