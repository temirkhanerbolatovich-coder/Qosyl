import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';
import { projectTemplates } from '../../src/lib/project-templates';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
async function language(page: Page, locale: 'ru' | 'kk') {
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if (await menu.isVisible()) await menu.click();
  await page.locator('header .locale-switch select').selectOption(locale);
  if (await menu.isVisible()) await menu.click();
}
function isolatedOnly() {
  const url = new URL(process.env.DATABASE_URL || 'invalid:');
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/student_marketplace_e2e_ui_[a-f0-9]{12}$/.test(url.pathname)
  )
    throw new Error('Special-rule checks require an isolated local E2E database.');
}
async function submitRejected(page: Page, path: string, submit: () => Promise<void>) {
  const pending = page.waitForResponse(
    (r) => new URL(r.url()).pathname === path && r.request().method() === 'POST',
  );
  await submit();
  const response = await pending;
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.code).toBe('VALIDATION_ERROR');
  return body.error as string;
}

test('real deadline and onsite rules retranslate without losing the project draft or posting again', async ({
  page,
}) => {
  isolatedOnly();
  await signInDemo(page, 'client');
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/platform') posts++;
  });
  await page.goto('/client/projects/new');
  const templates = page.getByRole('region', { name: 'Шаблоны задач', exact: true });
  await templates.getByRole('combobox').selectOption('spreadsheet');
  await templates.getByRole('button', { name: 'Заполнить пустые поля', exact: true }).click();
  await page.locator('[name=budgetKzt]').fill('5000');
  await page.locator('[name=contactPrivate]').fill('synthetic@example.test');
  const deadline = page.locator('[name=dueAt]');
  await deadline.fill('2000-01-01');
  // Bypass only the browser's date minimum to verify the real server rule.
  await deadline.evaluate((input) => input.removeAttribute('min'));
  const submit = () => page.locator('form button[type=submit]').click();
  const raw = await submitRejected(page, '/api/platform', submit);
  expect(raw).toBe('dueAt: Срок должен быть в будущем.');
  const alert = page.locator('main').getByRole('alert');
  await expect(alert).toContainText(raw);
  await language(page, 'kk');
  await expect(alert).toContainText('Мерзім: Болашақ күнді көрсетіңіз.');
  await expect(deadline).toHaveValue('2000-01-01');
  await expect(page.locator('[name=title]')).toHaveValue(projectTemplates[0].fields.title);
  expect(posts).toBe(1);
  await deadline.fill('2100-01-01');
  await page.locator('[name=mode]').selectOption('onsite');
  const city = await submitRejected(page, '/api/platform', submit);
  expect(city).toBe('city: Для очной работы укажите город.');
  await expect(alert).toContainText('Қала: Офлайн жұмыс үшін қаланы көрсетіңіз.');
  await language(page, 'ru');
  await expect(alert).toContainText(city);
  expect(posts).toBe(2);
});

test('real lead expiry, HTTPS and eligible-role failures keep the draft in both languages', async ({
  page,
}, info) => {
  isolatedOnly();
  await signInDemo(page, 'admin');
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/admin/leads') posts++;
  });
  await page.goto('/admin');
  await page.locator('.admin-tabs button').first().click();
  const form = page.locator('form').filter({ has: page.locator('[name=sourceUrl]') });
  await form.locator('[name=title]').fill('Синтетический лид для отказов валидации');
  await form
    .locator('[name=summary]')
    .fill('Синтетический текст, который сохраняется при смене языка и ошибках сервера.');
  await form.locator('[name=sourceName]').fill('Синтетический источник');
  await form.locator('[name=sourceUrl]').fill('http://example.org/request');
  const operator = await form
    .locator('[name=assignedToId] option:not([disabled])')
    .first()
    .getAttribute('value');
  await form.locator('[name=assignedToId]').selectOption(operator!);
  const submit = () => form.locator('button:not([type])').click();
  const https = await submitRejected(page, '/api/admin/leads', submit);
  expect(https).toContain('sourceUrl: Нужна HTTPS-ссылка');
  await language(page, 'kk');
  const alert = page.locator('main').getByRole('alert');
  await expect(alert).toContainText('Дереккөз сілтемесі:');
  expect(posts).toBe(1);
  await form.locator('[name=sourceUrl]').fill('https://example.org/request');
  await form.locator('[name=expiresAt]').fill('2100-01-01T12:00');
  await submitRejected(page, '/api/admin/leads', submit);
  await expect(alert).toContainText('Алдағы 90 күн');
  await form
    .locator('[name=expiresAt]')
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  // A forged option must still be rejected by the server's role check.
  await form
    .locator('[name=assignedToId]')
    .evaluate((select: HTMLSelectElement) =>
      select.add(new Option('Синтетическая неверная роль', 'demo-student')),
    );
  await form.locator('[name=assignedToId]').selectOption('demo-student');
  const role = await submitRejected(page, '/api/admin/leads', submit);
  expect(role).toBe('Выберите действующего администратора.');
  await expect(alert).toContainText('Белсенді әкімшіні таңдаңыз.');
  await expect(form.locator('[name=title]')).toHaveValue('Синтетический лид для отказов валидации');
  await language(page, 'ru');
  await expect(alert).toContainText(role);
  await language(page, 'kk');
  expect(posts).toBe(3);
  await mkdir('.local/f06-special-rules', { recursive: true });
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
    await info.attach(`lead-special-${width}-axe`, {
      body: JSON.stringify({ violations: audit.violations, incomplete: audit.incomplete }),
      contentType: 'application/json',
    });
    await page.screenshot({
      path: `.local/f06-special-rules/lead-error-kk-${width}.png`,
      fullPage: true,
    });
  }
});

test('real private-link, consent and catalog failures use the shared renderer; unknown parts remain whole', async ({
  page,
}) => {
  isolatedOnly();
  await signInDemo(page, 'client');
  const template = projectTemplates[0].fields;
  const project = {
    ...template,
    acceptanceCriteria: template.acceptanceCriteria.split('\n'),
    skills: [],
    estimatedHours: 4,
    budgetKzt: 5000,
    difficulty: 'beginner_friendly',
    mode: 'remote',
    dueAt: '2000-01-01',
  };
  const requests = [
    await page.request.post('/api/platform', {
      headers: { Origin: baseURL },
      data: {
        action: 'setPortfolio',
        projectId: 'synthetic-validation',
        title: 'Синтетическое портфолио',
        summary: 'Синтетическое описание портфолио.',
        role: 'Исполнитель',
        skills: [],
        visibility: 'public',
        publicLinks: ['https://example.org/api/attachments/synthetic'],
      },
    }),
    await page.request.post('/api/leads', {
      headers: { Origin: baseURL },
      data: { leadId: 'synthetic-validation', expectedVersion: 1, confirmation: false, project },
    }),
    await page.request.get('/api/platform?view=catalog&minBudget=5000&maxBudget=1000'),
  ];
  const failures: string[] = [];
  for (const response of requests) {
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    failures.push(body.error);
  }
  expect(failures[0]).toContain('publicLinks: Закрытые вложения');
  expect(failures[1]).toContain('confirmation: Неверный ввод: ожидалось true');
  expect(failures[1]).toContain('project.dueAt: Срок должен быть в будущем.');
  let message = failures[0],
    reads = 0;
  // Replay the exact server errors in the shared LoadState; the original requests above are real.
  await page.route('**/api/platform?*', (route) => {
    if (new URL(route.request().url()).searchParams.get('view') !== 'catalog')
      return route.continue();
    reads++;
    return route.fulfill({ status: 400, json: { error: message, code: 'VALIDATION_ERROR' } });
  });
  await page.goto('/projects');
  await language(page, 'kk');
  const state = page.locator('main .empty-state');
  await expect(state).toContainText('Жабық тіркемелерді портфолиода жариялауға болмайды.');
  const before = reads;
  await language(page, 'ru');
  await language(page, 'kk');
  expect(reads).toBe(before);
  message = failures[1];
  await state.getByRole('button', { name: 'Қайталау', exact: true }).click();
  await expect(state).toContainText('Келісім:');
  await expect(state).toContainText('Тапсырма мерзімі:');
  message = failures[2];
  await state.getByRole('button', { name: 'Қайталау', exact: true }).click();
  await expect(state).toContainText('Ең төменгі бюджеттен кем болмауы керек.');
  message = failures[1] + '; reason: Срок должен быть в будущем. — исходное пояснение';
  await state.getByRole('button', { name: 'Қайталау', exact: true }).click();
  await expect(state).toContainText('Бастапқы хабарлама:');
  await expect(state).toContainText(message);
  await expect(state.locator('span[lang=und]')).toContainText(message);
});

test('moderator-authored text matching a known error remains original when UI language changes', async ({
  page,
}) => {
  isolatedOnly();
  await signInDemo(page, 'admin');
  let reads = 0;
  await page.route('**/api/platform?*', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('view') !== 'project' || query.get('id') !== 'demo-excel')
      return route.continue();
    reads++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const body = await response.json();
    body.data.project.moderationReason = 'Срок заказа истек.';
    await route.fulfill({ response, json: body });
  });
  await page.goto('/projects/demo-excel');
  const original = page
    .locator('main .alert.warning span[lang=und]')
    .filter({ hasText: 'Срок заказа истек.' });
  await expect(original).toHaveText('Срок заказа истек.');
  const before = reads;
  await language(page, 'kk');
  await expect(original).toHaveText('Срок заказа истек.');
  await expect(original.locator('..')).toContainText('Модератор пікірі:');
  expect(reads).toBe(before);
});
