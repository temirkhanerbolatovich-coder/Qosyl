import { randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type APIRequestContext, type TestInfo } from '@playwright/test';
import { signInDemo } from '../ui-quality/demo-session';
import { parseDataResponse } from '../../src/contracts/api-response-validation';
import {
  commandDataSchemas,
  workDataSchema,
  type CommandData,
} from '../../src/contracts/api-responses';
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
async function work(page: Page, id: string) {
  const response = await page.request.get('/api/platform', { params: { view: 'work', id } });
  expect(response.status()).toBe(200);
  return parseDataResponse(workDataSchema, await response.json()).data;
}
async function fixture(student: Page, client: Page, admin: Page) {
  const url = new URL(process.env.DATABASE_URL || 'invalid:');
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/student_marketplace_e2e_ui_[a-f0-9]{12}$/.test(url.pathname) ||
    process.env.E2E_EXTERNAL_SERVER
  )
    throw new Error('Only a managed isolated local database may receive F06d fixtures.');
  await signInDemo(student, 'student');
  await signInDemo(client, 'client');
  await signInDemo(admin, 'admin');
  const created = await command(client.request, 'createProject', {
    title: `ДЕМО F06d: неизменяемый исходный текст ${randomBytes(5).toString('hex')}`,
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
  await command(admin.request, 'moderateProject', {
    projectId,
    approve: true,
    reason: 'Синтетический F06d, изолированная проверка.',
  });
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

test('F06d: application drafts, feedback, selection and consent-gated public portfolio in KK', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const clientContext = await browser.newContext({ baseURL });
  const adminContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const client = await clientContext.newPage(),
    admin = await adminContext.newPage(),
    guest = await guestContext.newPage();
  try {
    const id = await fixture(page, client, admin);
    await client.goto(`/client/projects/${id}/applications`);
    await language(client, 'kk');
    await expect(
      client.getByRole('heading', { name: 'Әзірге өтінімдер жоқ', exact: true }),
    ).toBeVisible();
    await page.goto(`/projects/${id}`);
    await language(page, 'kk');
    const form = page.locator('form').filter({ has: page.locator('textarea[name="message"]') });
    const message = 'Исходный синтетический отклик F06d: подготовлю результат по критериям.';
    await form.locator('[name="message"]').fill(message);
    await form.locator('[name="links"]').fill('https://example.com/synthetic-f06d');
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST') posts.push(r.url());
    });
    await language(page, 'ru');
    await language(page, 'kk');
    await expect(form.locator('[name="message"]')).toHaveValue(message);
    await expect(form.locator('[name="links"]')).toHaveValue('https://example.com/synthetic-f06d');
    expect(posts).toHaveLength(0);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/platform', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await gate;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic original service detail F06d.' }),
      });
    });
    await form.getByRole('button', { name: 'Өтінімді тегін жіберу', exact: true }).click();
    try {
      await expect(form.locator('button[type=submit]')).toHaveText('Сақталуда…');
      await language(page, 'ru');
      await expect(form.locator('button[type=submit]')).toHaveText('Сохраняем…');
      expect(posts).toHaveLength(1);
    } finally {
      release();
    }
    await expect(page.locator('main [role=alert]')).toContainText(
      'Synthetic original service detail F06d.',
    );
    await page.unroute('**/api/platform');
    await language(page, 'kk');
    await expect(page.locator('main [role=alert] [lang=und]')).toContainText(
      'Synthetic original service detail F06d.',
    );
    await form.getByRole('button', { name: 'Өтінімді тегін жіберу', exact: true }).click();
    await expect(page.locator('main .alert.success')).toContainText('Өтінім жіберілді.');
    await language(page, 'ru');
    await expect(page.locator('main .alert.success')).toContainText('Отклик отправлен.');
    await form.locator('[name="message"]').fill(message + ' Обновление.');
    await language(page, 'kk');
    await form.getByRole('button', { name: 'Өтінімді жаңарту', exact: true }).click();
    await expect(page.locator('main .alert.success')).toContainText('Өтінім жаңартылды');
    await form.getByRole('button', { name: 'Өтінімді қайтару', exact: true }).click();
    await expect(page.locator('main .alert.success')).toContainText('Өтінім қайтарылды');
    await form.locator('[name="message"]').fill(message);
    await form.getByRole('button', { name: 'Өтінімді тегін жіберу', exact: true }).click();
    await expect(page.locator('main .alert.success')).toContainText('Өтінім жіберілді.');
    await client.goto(`/client/projects/${id}/applications`);
    await language(client, 'kk');
    await expect(client.locator('.applicant-message')).toHaveText(message);
    const clientPosts: string[] = [];
    client.on('request', (r) => {
      if (r.method() === 'POST') clientPosts.push(r.url());
    });
    await client.getByRole('button', { name: 'Орындаушыны таңдау', exact: true }).click();
    await language(client, 'ru');
    await language(client, 'kk');
    expect(clientPosts).toHaveLength(0);
    await expect(
      client.getByRole('button', { name: 'Таңдауды растау', exact: true }),
    ).toBeVisible();
    await client.getByRole('button', { name: 'Таңдауды растау', exact: true }).click();
    await expect(client.locator('main .alert.success')).toContainText('Орындаушы таңдалды.');
    const state = await work(page, id);
    expect(state.project.status).toBe('assigned');
    await command(page.request, 'approveAgreement', {
      projectId: id,
      agreementId: state.agreements[0].id,
    });
    await command(client.request, 'approveAgreement', {
      projectId: id,
      agreementId: state.agreements[0].id,
    });
    const submission = await command(page.request, 'submitDeliverable', {
      projectId: id,
      links: ['https://example.com/private-result-f06d'],
      notes: 'Синтетический результат для приёмки F06d.',
    });
    await command(client.request, 'acceptSubmission', {
      projectId: id,
      submissionId: submission.id,
    });
    const title = `Согласованный синтетический итог F06d ${id}`;
    await command(page.request, 'setPortfolio', {
      projectId: id,
      title,
      summary: 'Обезличенный исходный результат синтетической проверки F06d.',
      role: 'Аналитик',
      skills: ['Excel'],
      publicLinks: ['https://example.com/hidden-redacted-f06d'],
      visibility: 'redacted_public',
    });
    const consent = async (actor: Page) =>
      command(actor.request, 'consentPortfolio', {
        projectId: id,
        expectedUpdatedAt: (await work(actor, id)).portfolio!.updatedAt,
      });
    await consent(page);
    await guest.goto('/talent/demo-student');
    await language(guest, 'kk');
    await expect(guest.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
    await consent(client);
    await guest.reload();
    const record = guest
      .locator('article')
      .filter({ has: guest.getByRole('heading', { name: title, exact: true }) });
    await expect(record).toContainText('Жеке деректерсіз нәтиже');
    await expect(record).toContainText('Qosyl платформасында орындалған · platform_verified');
    await expect(record.locator('time')).toHaveText(/\d{2}\.\d{2}\.\d{4}/);
    expect(await guest.locator('main').innerHTML()).not.toContain('private-result-f06d');
    expect(await guest.locator('main').innerHTML()).not.toContain('hidden-redacted-f06d');
    const snapshot = await record.locator('h3').innerText();
    await language(guest, 'ru');
    await expect(record).toContainText('Обезличенный результат');
    await expect(record).toContainText('Выполнено на Qosyl · platform_verified');
    await expect(record.locator('time')).not.toHaveText(/\d{2}\.\d{2}\.\d{4}/);
    await language(guest, 'kk');
    await expect(record.locator('h3')).toHaveText(snapshot);
    await expect(
      guest.getByText('Бұл нақты төлемнің расталуы емес.', { exact: false }),
    ).toBeVisible();
    await inspect(guest, info, 'confirmed-profile-kk');
  } finally {
    await clientContext.close();
    await adminContext.close();
    await guestContext.close();
  }
});

test('F06d: public detail, applicants and profile across RU/KK, themes and four widths', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const clientContext = await browser.newContext({ baseURL }),
    adminContext = await browser.newContext({ baseURL });
  const client = await clientContext.newPage(),
    admin = await adminContext.newPage();
  try {
    const id = await fixture(page, client, admin);
    await command(page.request, 'applyToProject', {
      projectId: id,
      message: 'Исходный синтетический отклик F06d для визуальной проверки.',
      links: [],
    });
    let i = 0;
    for (const locale of ['ru', 'kk'] as const)
      for (const theme of ['light', 'dark'])
        for (const width of [375, 768, 1440, 1920]) {
          const screen = ['detail', 'applicants', 'profile'][i++ % 3];
          const target = screen === 'applicants' ? client : page;
          await target.bringToFront();
          await target.setViewportSize({ width, height: 1000 });
          await target.goto(
            screen === 'detail'
              ? `/projects/${id}`
              : screen === 'applicants'
                ? `/client/projects/${id}/applications`
                : '/talent/demo-student',
          );
          await language(target, locale);
          await expect(target.locator('main h1')).toBeVisible();
          const menu = target.locator('header button[aria-controls="header-navigation"]');
          if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
            await menu.click();
          await target
            .locator('header .theme-switch:not(.locale-switch) select')
            .selectOption(theme);
          if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'true')
            await menu.click();
          await inspect(target, info, `${screen}-${locale}-${theme}-${width}`);
        }
  } finally {
    await clientContext.close();
    await adminContext.close();
  }
});

test('F06d: localized loading, original load errors and retry without mutations', async ({
  page,
}) => {
  for (const path of [
    '/projects/synthetic-f06d-unavailable',
    '/client/projects/synthetic-f06d-unavailable/applications',
  ]) {
    await signInDemo(page, 'client');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let attempts = 0;
    await page.route('**/api/platform?**', async (route) => {
      const view = new URL(route.request().url()).searchParams.get('view');
      if (!['project', 'applications'].includes(view ?? '')) return route.continue();
      attempts++;
      if (attempts === 1) await gate;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: attempts === 1 ? 'Synthetic unavailable detail F06d.' : 'Заказ не найден',
        }),
      });
    });
    const posts: string[] = [];
    const listener = (r: import('@playwright/test').Request) => {
      if (r.method() === 'POST') posts.push(r.url());
    };
    page.on('request', listener);
    await page.goto(path);
    try {
      await language(page, 'kk');
      await expect(page.locator('main [role=status][aria-label="Жүктелуде"]')).toBeVisible();
      await language(page, 'ru');
      await expect(page.locator('main [role=status][aria-label="Загрузка"]')).toBeVisible();
    } finally {
      release();
    }
    await expect(
      page.getByRole('heading', { name: 'Не удалось открыть страницу', exact: true }),
    ).toBeVisible();
    await language(page, 'kk');
    await expect(
      page.getByRole('heading', { name: 'Бетті ашу мүмкін болмады', exact: true }),
    ).toBeVisible();
    await expect(page.locator('main [lang=und]')).toContainText(
      'Synthetic unavailable detail F06d.',
    );
    await page.getByRole('button', { name: 'Қайталау', exact: true }).click();
    await expect.poll(() => attempts).toBe(2);
    await expect(page.locator('main .empty-state')).toContainText('Тапсырыс табылмады');
    await expect(page.locator('main .empty-state')).not.toContainText('Бастапқы хабарлама:');
    await language(page, 'ru');
    await expect(page.locator('main .empty-state')).toContainText('Заказ не найден');
    expect(attempts).toBe(2);
    expect(posts).toHaveLength(0);
    page.off('request', listener);
    await page.unroute('**/api/platform?**');
  }
});
