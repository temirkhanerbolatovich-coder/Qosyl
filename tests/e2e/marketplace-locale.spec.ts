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
    throw new Error('Only a managed isolated local database may receive F06c fixtures.');
  await signInDemo(student, 'student');
  await signInDemo(client, 'client');
  await signInDemo(admin, 'admin');
  const created = await command(client.request, 'createProject', {
    title: `ДЕМО F06c: неизменяемый исходный текст ${randomBytes(5).toString('hex')}`,
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
    reason: 'Синтетический F06c, изолированная проверка.',
  });
  const application = await command(student.request, 'applyToProject', {
    projectId,
    message: 'Синтетический отклик для проверки локализации рабочего процесса.',
    links: [],
  });
  await command(client.request, 'selectApplicant', { projectId, applicationId: application.id });
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

test('F06c: real KK agreements, file submission, acceptance and separate payment/closure preserve drafts', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const clientContext = await browser.newContext({ baseURL });
  const adminContext = await browser.newContext({ baseURL });
  const client = await clientContext.newPage();
  const admin = await adminContext.newPage();
  try {
    const id = await fixture(page, client, admin);
    await page.goto(`/work/${id}`);
    await client.goto(`/work/${id}`);
    await language(page, 'kk');
    await language(client, 'kk');
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST') posts.push(r.url());
    });
    await expect(
      page.getByRole('heading', { name: 'Келісілген шарттар', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Файлдарды беру шарттарды екі тарап растағаннан кейін қолжетімді болады.', {
        exact: true,
      }),
    ).toBeVisible();
    const proposal = page
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: 'Шарттарды өзара келісіммен өзгерту' }) });
    await proposal.locator('summary').click();
    await proposal
      .locator('[name="deliverables"]')
      .fill('Неотправленный исходный черновик условий F06c');
    await language(page, 'ru');
    await language(page, 'kk');
    await expect(proposal).toHaveAttribute('open', '');
    await expect(proposal.locator('[name="deliverables"]')).toHaveValue(
      'Неотправленный исходный черновик условий F06c',
    );
    expect(posts).toHaveLength(0);
    await proposal.locator('summary').click();
    await client.getByRole('button', { name: 'Нұсқаның шарттарын растау 1', exact: true }).click();
    await page.getByRole('button', { name: 'Нұсқаның шарттарын растау 1', exact: true }).click();
    await expect(page.locator('main .alert.success[role=status]')).toContainText(
      'Сіздің тарапыңыз шарттарды растады',
    );
    const approvalPosts = posts.length;
    await language(page, 'ru');
    await expect(page.locator('main .alert.success[role=status]')).toContainText(
      'Ваша сторона подтвердила условия',
    );
    await language(page, 'kk');
    expect(posts).toHaveLength(approvalPosts);
    const submission = page.locator('form').filter({ has: page.locator('textarea[name="links"]') });
    await submission
      .locator('[name="notes"]')
      .fill('Синтетическая сдача F06c с сохранением черновика.');
    await submission.getByRole('button', { name: 'Нәтижені жіберу', exact: true }).click();
    await expect(submission.getByRole('alert')).toContainText('Кемінде бір HTTPS');
    await language(page, 'ru');
    await expect(submission.getByRole('alert')).toContainText('Добавьте хотя бы одну HTTPS');
    await language(page, 'kk');
    const upload = page.locator('form').filter({ has: page.locator('input[type="file"]') });
    await upload.locator('input[type=file]').setInputFiles({
      name: 'synthetic-f06c.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Synthetic F06c, no private information.'),
    });
    const beforeFile = posts.length;
    await language(page, 'ru');
    await language(page, 'kk');
    expect(
      await upload
        .locator('input[type=file]')
        .evaluate((el: HTMLInputElement) => el.files?.[0].name),
    ).toBe('synthetic-f06c.txt');
    expect(posts).toHaveLength(beforeFile);
    await upload.getByRole('button', { name: 'Жабық файлды жүктеу', exact: true }).click();
    await expect(page.getByRole('link', { name: /Жүктеп алу synthetic-f06c/ })).toBeVisible();
    await submission.locator('[name="attachmentIds"]').check();
    await language(page, 'ru');
    await language(page, 'kk');
    await expect(submission.locator('[name="attachmentIds"]')).toBeChecked();
    await expect(submission.locator('[name="notes"]')).toHaveValue(
      'Синтетическая сдача F06c с сохранением черновика.',
    );
    await submission.getByRole('button', { name: 'Нәтижені жіберу', exact: true }).click();
    await expect(page.locator('main .alert.success[role=status]')).toContainText(
      'Нәтиже тапсырыс берушіге тексеруге жіберілді',
    );
    await client.reload();
    await client.getByRole('button', { name: 'Нәтижені қабылдау', exact: true }).click();
    await expect(
      client.getByRole('button', { name: 'Мен платформадан тыс төледім', exact: true }),
    ).toBeVisible();
    expect((await work(page, id)).project.status).toBe('accepted');
    await client.getByRole('button', { name: 'Мен платформадан тыс төледім', exact: true }).click();
    await expect(client.locator('main .alert.success[role=status]')).toContainText(
      'Төлем туралы хабарладыңыз.',
    );
    await page.reload();
    await expect(page.locator('.payment-label')).toHaveText(
      'Тапсырыс беруші төлем туралы хабарлады',
    );
    expect((await work(page, id)).project.status).toBe('accepted');
    const portfolio = page.locator('form').filter({ has: page.locator('[name="visibility"]') });
    await portfolio
      .locator('[name="summary"]')
      .fill('Неотправленный синтетический текст портфолио, без закрытых данных.');
    await portfolio.locator('[name="visibility"]').selectOption('redacted_public');
    await language(page, 'ru');
    await language(page, 'kk');
    await expect(portfolio.locator('[name="visibility"]')).toHaveValue('redacted_public');
    await expect(portfolio.locator('[name="summary"]')).toHaveValue(
      'Неотправленный синтетический текст портфолио, без закрытых данных.',
    );
    await page.getByRole('button', { name: 'Мен төлемді алдым', exact: true }).click();
    await expect(page.locator('.payment-label')).toHaveText('Орындаушы төлемді алғанын растады');
    await page.getByRole('button', { name: 'Жабуды растау', exact: true }).click();
    await expect(page.locator('main .alert.success[role=status]')).toContainText(
      'Сіздің тарапыңыз жабуды растады',
    );
    await client.reload();
    await client.getByRole('button', { name: 'Жабуды растау', exact: true }).click();
    await expect(client.locator('main .alert.success[role=status]')).toContainText(
      'Сіздің тарапыңыз жабуды растады',
    );
    expect((await work(page, id)).project.status).toBe('completed');
    await page.reload();
    await inspect(page, info, 'completed-work-kk');
  } finally {
    await clientContext.close();
    await adminContext.close();
  }
});

test('F06c: dashboards and project form retain original content, draft and synthetic error across locales', async ({
  page,
}) => {
  await signInDemo(page, 'client');
  await page.goto('/dashboard');
  await language(page, 'kk');
  await expect(page.getByRole('navigation', { name: 'Жеке кабинет' })).toBeVisible();
  for (const [url, heading] of [
    ['/client/projects', 'Менің тапсырыстарым'],
    ['/student/applications', 'Менің өтінімдерім'],
    ['/student/projects', 'Менің жобаларым'],
  ]) {
    await signInDemo(page, url.startsWith('/student/') ? 'student' : 'client');
    await page.goto(url);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await signInDemo(page, 'client');
  await page.goto('/client/projects/new');
  const form = page.locator('main form');
  await form.locator('[name="title"]').fill('Синтетическая исходная задача F06c');
  await form
    .getByRole('combobox', { name: 'Тапсырма үлгісі', exact: true })
    .selectOption({ index: 1 });
  await form.getByRole('button', { name: 'Бос өрістерді толтыру' }).click();
  await form.locator('[name="budgetKzt"]').fill('5000');
  await form.locator('[name="contactPrivate"]').fill('synthetic@example.test');
  await form
    .locator('[name="dueAt"]')
    .fill(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const snapshot = await form.evaluate((el: HTMLFormElement) => [...new FormData(el).entries()]);
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.url());
  });
  await language(page, 'ru');
  await language(page, 'kk');
  expect(await form.evaluate((el: HTMLFormElement) => [...new FormData(el).entries()])).toEqual(
    snapshot,
  );
  expect(posts).toHaveLength(0);
  expect(
    await form.evaluate((el: HTMLFormElement) =>
      Array.from(el.elements)
        .filter(
          (field): field is HTMLInputElement =>
            field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            field instanceof HTMLSelectElement,
        )
        .filter((field) => !field.validity.valid)
        .map((field) => ({
          name: field.name,
          value: field.value,
          message: field.validationMessage,
        })),
    ),
  ).toEqual([]);
  let phase: 'hold' | 'unknown' | 'network' = 'hold';
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/platform', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    if (phase === 'hold') await held;
    if (phase === 'network') return route.abort('failed');
    return route.fulfill({
      status: 403,
      json: { error: 'Synthetic moderator detail stays original.' },
    });
  });
  await form.getByRole('button', { name: 'Жоба нұсқасын сақтау', exact: true }).click();
  try {
    await expect(form.locator('button[type=submit]')).toBeDisabled();
    await expect(form.locator('button[type=submit]')).toHaveText('Сақталуда…');
    const pendingPosts = posts.length;
    await language(page, 'ru');
    await expect(form.locator('button[type=submit]')).toHaveText('Сохраняем…');
    await language(page, 'kk');
    expect(posts).toHaveLength(pendingPosts);
  } finally {
    phase = 'unknown';
    release();
  }
  await expect(form.getByRole('alert')).toContainText('Synthetic moderator detail stays original.');
  await expect(form.getByRole('alert').locator('[lang="und"]')).toContainText(
    'Synthetic moderator detail stays original.',
  );
  const failedPosts = posts.length;
  await language(page, 'ru');
  await language(page, 'kk');
  expect(posts).toHaveLength(failedPosts);
  expect(await form.evaluate((el: HTMLFormElement) => [...new FormData(el).entries()])).toEqual(
    snapshot,
  );
  phase = 'network';
  await form.locator('button[type=submit]').click();
  await expect(form.getByRole('alert')).toContainText('Өзгерістер расталмады.');
  const networkPosts = posts.length;
  await language(page, 'ru');
  await expect(form.getByRole('alert')).toContainText('Изменения не подтверждены.');
  await language(page, 'kk');
  expect(posts).toHaveLength(networkPosts);
});

test('F06c: RU/KK dashboard, editor and working layout across themes and four widths', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const clientContext = await browser.newContext({ baseURL });
  const adminContext = await browser.newContext({ baseURL });
  const client = await clientContext.newPage(),
    admin = await adminContext.newPage();
  try {
    const id = await fixture(page, client, admin);
    const agreementId = (await work(page, id)).agreements[0].id;
    await command(page.request, 'approveAgreement', { projectId: id, agreementId });
    await command(client.request, 'approveAgreement', { projectId: id, agreementId });
    let i = 0;
    for (const locale of ['ru', 'kk'] as const)
      for (const theme of ['light', 'dark'])
        for (const width of [375, 768, 1440, 1920]) {
          const screen = ['dashboard', 'editor', 'work'][i++ % 3];
          const target = screen === 'work' ? page : client;
          await target.bringToFront();
          await target.setViewportSize({ width, height: 1000 });
          await target.goto(
            screen === 'work'
              ? `/work/${id}`
              : screen === 'editor'
                ? '/client/projects/new'
                : '/dashboard',
          );
          await language(target, locale);
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
