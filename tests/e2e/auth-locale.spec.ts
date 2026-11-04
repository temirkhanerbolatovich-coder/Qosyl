import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request, type TestInfo } from '@playwright/test';
import { parseDataResponse } from '../../src/contracts/api-response-validation';
import { profileDataSchema, profileSavedDataSchema } from '../../src/contracts/api-responses';
import { signInDemo } from '../ui-quality/demo-session';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
type Locale = 'ru' | 'kk';
const modeCases = [
  { path: '/auth/login', heading: 'Қайта қош келдіңіз', button: 'Кіру' },
  { path: '/auth/register', heading: 'Алғашқы нақты жобаңыз', button: 'Аккаунт жасау' },
  {
    path: '/auth/forgot-password',
    heading: 'Қолжетімділікті қалпына келтіру',
    button: 'Сілтеме жіберу',
  },
  {
    path: '/auth/reset-password?token=synthetic-display-only',
    heading: 'Жаңа құпиясөз',
    button: 'Құпиясөзді сақтау',
  },
  {
    path: '/auth/verify-email',
    heading: 'Email мекенжайын растау',
    button: 'Хатты қайта жіберу',
  },
] as const;

function isolatedDatabase() {
  const name = process.env.E2E_DATABASE_NAME;
  const url = new URL(process.env.DATABASE_URL || 'invalid:');
  if (
    !name ||
    !/^student_marketplace_e2e(?:_ui_[a-f0-9]{12})?$/.test(name) ||
    url.pathname !== '/' + name ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    process.env.E2E_EXTERNAL_SERVER
  )
    throw new Error('Auth fixtures require the managed isolated local E2E database.');
  return url.toString();
}

async function changeLocale(page: Page, locale: Locale) {
  const menu = page.locator('header button[aria-controls="header-navigation"]');
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
  await page.locator('header .locale-switch select').selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'true')
    await menu.click();
}

async function inspect(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (animation) =>
                  Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
                  !['finished', 'idle'].includes(animation.playState),
              ).length,
        ),
      { timeout: 10000 },
    )
    .toBe(0);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    locale: document.documentElement.lang,
    theme: document.documentElement.dataset.theme,
  }));
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await info.attach(`${name}-audit`, {
    body: JSON.stringify({ layout, violations: audit.violations, incomplete: audit.incomplete }),
    contentType: 'application/json',
  });
  expect(layout.documentWidth, `${name}: horizontal overflow`).toBeLessThanOrEqual(
    layout.viewport + 1,
  );
  expect(
    audit.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? '')),
    `${name}: serious/critical axe findings`,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

function mutationRecorder(page: Page) {
  const mutations: string[] = [];
  const record = (request: Request) => {
    if (request.method() === 'POST') mutations.push(new URL(request.url()).pathname);
  };
  page.on('request', record);
  return { mutations, stop: () => page.off('request', record) };
}

function emailAuthForm(page: Page) {
  // Google has independent submit/consent controls; keep email drafts in their own form.
  return page.locator('main form').filter({
    has: page.locator('input[name="email"], input[name="password"]'),
  });
}

async function fillRegistration(page: Page, email: string, password: string) {
  const form = emailAuthForm(page);
  await form.locator('input[name="name"]').fill('СИНТЕТИКАЛЫҚ F06b қатысушы');
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(password);
  await form.locator('input[name="confirmPassword"]').fill(password);
  await form.locator('input[name="adultConfirmed"]').check();
  await form.locator('input[name="privacyConsent"]').check();
}

test('F06b: all auth modes render Kazakh in SSR and preserve drafts and consent without POST', async ({
  page,
}, info) => {
  await page.goto('/auth/login');
  await changeLocale(page, 'kk');
  const recorder = mutationRecorder(page);
  const evidence: { path: string; heading: string; ssr: boolean }[] = [];
  try {
    for (const mode of modeCases) {
      await page.goto(mode.path);
      const main = page.locator('main');
      const form = emailAuthForm(page);
      await expect(main.locator('#auth-heading')).toHaveText(mode.heading);
      await expect(form.locator('button[type="submit"]')).toHaveText(mode.button);
      const response = await page.request.get(mode.path);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toMatch(/<html[^>]*lang="kk"/u);
      expect(html).toContain(mode.heading);
      await page.reload();
      await expect(main.locator('#auth-heading')).toHaveText(mode.heading);
      if (await form.locator('input[name="email"]').count())
        await expect(form.getByLabel('Email', { exact: true })).toHaveAttribute('name', 'email');
      if (await form.locator('input[name="password"]').count())
        await expect(
          form.locator('input').and(
            form.getByLabel(mode.path.includes('reset-password') ? 'Жаңа құпиясөз' : 'Құпиясөз', {
              exact: true,
            }),
          ),
        ).toHaveAttribute('name', 'password');
      if (await form.locator('input[name="confirmPassword"]').count())
        await expect(form.getByLabel('Құпиясөзді қайталаңыз', { exact: true })).toHaveAttribute(
          'name',
          'confirmPassword',
        );
      if (mode.path === '/auth/register') {
        await expect(form.getByLabel('Көрсетілетін есім', { exact: true })).toHaveAttribute(
          'name',
          'name',
        );
        await expect(form.getByLabel('Мен 18 жасқа толдым', { exact: true })).toHaveAttribute(
          'name',
          'adultConfirmed',
        );
        await expect(
          form.getByLabel('Пилот шарттарымен және дербес деректерді өңдеумен келісемін', {
            exact: true,
          }),
        ).toHaveAttribute('name', 'privacyConsent');
      }
      const entered: { name: string; value: string }[] = [];
      for (const name of ['name', 'email', 'password', 'confirmPassword']) {
        const input = form.locator(`input[name="${name}"]`);
        if (!(await input.count())) continue;
        const value =
          name === 'email'
            ? 'synthetic-unsent@example.test'
            : name === 'name'
              ? 'Менің өзгермейтін есімім — синтетический черновик'
              : 'Synthetic-unsent-passphrase-12';
        await input.fill(value);
        entered.push({ name, value });
      }
      for (const name of ['adultConfirmed', 'privacyConsent']) {
        const checkbox = form.locator(`input[name="${name}"]`);
        if (await checkbox.count()) await checkbox.check();
      }
      const currentURL = page.url();
      for (const locale of ['ru', 'kk'] as const) {
        await changeLocale(page, locale);
        expect(page.url()).toBe(currentURL);
        for (const { name, value } of entered)
          await expect(form.locator(`input[name="${name}"]`)).toHaveValue(value);
        for (const name of ['adultConfirmed', 'privacyConsent']) {
          const checkbox = form.locator(`input[name="${name}"]`);
          if (await checkbox.count()) await expect(checkbox).toBeChecked();
        }
      }
      evidence.push({ path: mode.path.split('?')[0], heading: mode.heading, ssr: true });
    }
    expect(recorder.mutations).toEqual([]);
    await info.attach('auth-ssr-and-draft-scope', {
      body: JSON.stringify({ modes: evidence, postsDuringLocaleChange: 0, deliveryTested: false }),
      contentType: 'application/json',
    });
  } finally {
    recorder.stop();
  }
});

test('F06b: mismatch and synthetic pending, rate, server, network and success feedback retranslate', async ({
  page,
}, info) => {
  await page.goto('/auth/register');
  await changeLocale(page, 'kk');
  await fillRegistration(page, 'synthetic-never-registered@example.test', 'Synthetic-password-12');
  await emailAuthForm(page).locator('input[name="confirmPassword"]').fill('Different-password-12');
  const recorder = mutationRecorder(page);
  await emailAuthForm(page).locator('button[type="submit"]').click();
  const alert = page.locator('main').getByRole('alert');
  await expect(alert).toContainText('Құпиясөздер сәйкес келмейді.');
  expect(recorder.mutations).toEqual([]);
  await changeLocale(page, 'ru');
  await expect(alert).toContainText('Пароли не совпадают.');
  await changeLocale(page, 'kk');
  await expect(alert).toContainText('Құпиясөздер сәйкес келмейді.');
  recorder.stop();

  await page.goto('/auth/login');
  await emailAuthForm(page).locator('input[name="email"]').fill('synthetic-failure@example.test');
  await emailAuthForm(page).locator('input[name="password"]').fill('Synthetic-password-12');
  let phase: 'hold' | 'rate' | 'server' | 'network' = 'hold';
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/sign-in/email', async (route) => {
    if (phase === 'hold') await hold;
    if (phase === 'network') return route.abort('failed');
    return route.fulfill({
      status: phase === 'rate' ? 429 : 503,
      json: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic local intercepted response' },
    });
  });
  const submit = emailAuthForm(page).locator('button[type="submit"]');
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(submit).toContainText('Күте тұрыңыз…');
  await changeLocale(page, 'ru');
  await expect(submit).toBeDisabled();
  await expect(submit).toContainText('Подождите…');
  await changeLocale(page, 'kk');
  phase = 'rate';
  release();
  await expect(alert).toContainText('Әрекет тым көп. Бір минут күтіп, қайталаңыз.');
  await changeLocale(page, 'ru');
  await expect(alert).toContainText('Слишком много попыток. Подождите минуту и повторите.');
  await changeLocale(page, 'kk');
  phase = 'server';
  await submit.click();
  await expect(alert).toContainText('Қызмет уақытша қолжетімсіз. Кейінірек қайталап көріңіз.');
  await changeLocale(page, 'ru');
  await expect(alert).toContainText('Сервис временно недоступен. Попробуйте ещё раз позже.');
  await changeLocale(page, 'kk');
  phase = 'network';
  await submit.click();
  await expect(alert).toContainText('Сервермен байланыс жоқ. Қосылымды тексеріп, қайталаңыз.');
  await changeLocale(page, 'ru');
  await expect(alert).toContainText('Нет связи с сервером. Проверьте соединение и повторите.');
  await page.unroute('**/api/auth/sign-in/email');

  for (const endpoint of ['request-password-reset', 'send-verification-email'])
    await page.route(`**/api/auth/${endpoint}`, (route) =>
      route.fulfill({ json: { status: true } }),
    );
  for (const route of ['/auth/forgot-password', '/auth/verify-email']) {
    await page.goto(route);
    await changeLocale(page, 'kk');
    await emailAuthForm(page)
      .locator('input[name="email"]')
      .fill('synthetic-not-delivered@example.test');
    await emailAuthForm(page).locator('button[type="submit"]').click();
    const success = page.locator('main').getByRole('status');
    await expect(success).toBeVisible();
    const kazakh = await success.innerText();
    expect(kazakh).toMatch(/[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/u);
    await changeLocale(page, 'ru');
    await expect(success).toContainText('Если для этого адреса доступно действие');
    await changeLocale(page, 'kk');
    await expect(success).toHaveText(kazakh, { useInnerText: true });
  }
  await info.attach('synthetic-auth-feedback-scope', {
    body: JSON.stringify({
      fixture: 'Intercepted local auth responses and client mismatch',
      liveProviderQueried: false,
      realEmailDeliveryTested: false,
    }),
    contentType: 'application/json',
  });
});

test('F06b: real Kazakh signup and both profile roles preserve drafts and persist contract data', async ({
  page,
}) => {
  isolatedDatabase();
  const suffix = randomBytes(8).toString('hex');
  const email = `f06b-profile-${suffix}@example.test`;
  const password = `Synthetic-${randomBytes(18).toString('base64url')}`;
  await page.goto('/auth/register');
  await changeLocale(page, 'kk');
  await fillRegistration(page, email, password);
  await emailAuthForm(page).locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/onboarding$/u);
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toHaveText(
    'Профиліңізден бастайық',
  );
  const editor = page.locator('main .profile-editor');
  await expect(
    editor.getByRole('button', { name: 'Мен орындаушымын', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await editor.locator('input[name="city"]').fill('Өскемен — синтетикалық қала');
  await editor.locator('input[name="discipline"]').fill('Тестілік деректерді талдау');
  await editor.locator('input[name="institution"]').fill('Синтетикалық оқу орны');
  await editor.locator('textarea[name="bio"]').fill('Тек автоматты тексеруге арналған сипаттама.');
  await editor.locator('input[name="skills"]').fill('Excel, Деректерді талдау');
  await editor.locator('input[name="weeklyHours"]').fill('7');
  await editor.locator('input[name="formats"][value="onsite"]').check();
  await editor.locator('input[name="isPublic"]').check();
  const recorder = mutationRecorder(page);
  const url = page.url();
  for (const locale of ['ru', 'kk'] as const) {
    await changeLocale(page, locale);
    expect(page.url()).toBe(url);
    await expect(editor.locator('input[name="city"]')).toHaveValue('Өскемен — синтетикалық қала');
    await expect(editor.locator('input[name="weeklyHours"]')).toHaveValue('7');
    await expect(editor.locator('input[name="formats"][value="onsite"]')).toBeChecked();
    await expect(editor.locator('input[name="isPublic"]')).toBeChecked();
  }
  expect(recorder.mutations).toEqual([]);
  recorder.stop();
  const studentSave = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/profile' && response.request().method() === 'POST',
  );
  await editor.locator('button[type="submit"]').click();
  const studentResponse = await studentSave;
  expect(studentResponse.status()).toBe(200);
  expect(parseDataResponse(profileSavedDataSchema, await studentResponse.json()).data).toEqual({
    saved: true,
    role: 'student',
  });
  await expect(page).toHaveURL(/\/dashboard$/u);
  let response = await page.request.get('/api/profile');
  expect(response.status()).toBe(200);
  const student = parseDataResponse(profileDataSchema, await response.json()).data;
  expect(student).toMatchObject({
    email,
    roles: ['student'],
    demo: false,
    studentProfile: { city: 'Өскемен — синтетикалық қала', weeklyHours: 7, isPublic: true },
    externalWorks: [],
  });
  expect(student.studentProfile?.formats).toEqual(expect.arrayContaining(['remote', 'onsite']));

  await page.goto('/onboarding?role=client');
  await expect(
    editor.getByRole('button', { name: 'Мен тапсырыс берушімін', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await editor.locator('input[name="city"]').fill('Синтетикалық Өскемен');
  await editor.locator('input[name="organisationName"]').fill('СИНТЕТИКАЛЫҚ F06b ұйым');
  await editor.locator('input[name="industry"]').fill('Тек тестілеу');
  await editor.locator('input[name="contact"]').fill('Синтетикалық байланыс, нақты адам емес');
  await editor.locator('textarea[name="description"]').fill('Синтетикалық тапсырыс беруші.');
  const clientDraft = mutationRecorder(page);
  await changeLocale(page, 'ru');
  await changeLocale(page, 'kk');
  await expect(editor.locator('input[name="organisationName"]')).toHaveValue(
    'СИНТЕТИКАЛЫҚ F06b ұйым',
  );
  await expect(editor.locator('input[name="contact"]')).toHaveValue(
    'Синтетикалық байланыс, нақты адам емес',
  );
  expect(clientDraft.mutations).toEqual([]);
  clientDraft.stop();
  const clientSave = page.waitForResponse(
    (item) => new URL(item.url()).pathname === '/api/profile' && item.request().method() === 'POST',
  );
  await editor.locator('button[type="submit"]').click();
  const clientResponse = await clientSave;
  expect(clientResponse.status()).toBe(200);
  expect(parseDataResponse(profileSavedDataSchema, await clientResponse.json()).data.role).toBe(
    'client',
  );
  await expect(page).toHaveURL(/\/dashboard$/u);
  response = await page.request.get('/api/profile');
  expect(response.status()).toBe(200);
  const both = parseDataResponse(profileDataSchema, await response.json()).data;
  expect(both.roles).toEqual(expect.arrayContaining(['student', 'client']));
  expect(both.roles).not.toContain('admin');
  expect(both.studentProfile).toEqual(student.studentProfile);
  expect(both.externalWorks).toEqual(student.externalWorks);
  expect(both.clientProfile).toMatchObject({
    name: 'СИНТЕТИКАЛЫҚ F06b ұйым',
    verificationStatus: 'pending',
  });
});

async function localResetToken(email: string) {
  const directory = path.join(process.cwd(), '.local', 'mail');
  let token = '';
  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .reverse();
  for (const file of files) {
    const mail = JSON.parse(await readFile(path.join(directory, file), 'utf8')) as {
      to?: string;
      text?: string;
    };
    if (mail.to !== email) continue;
    const match = mail.text?.match(/https?:\/\/\S+/u)?.[0];
    if (!match) continue;
    const url = new URL(match);
    if (url.origin !== baseURL)
      throw new Error('Reset mail must point to the isolated local server.');
    token = url.searchParams.get('token') ?? url.pathname.split('/').at(-1) ?? '';
    if (token) break;
  }
  expect(Boolean(token), 'A reset token exists only in the private local mail fixture').toBe(true);
  return token;
}

test('F06b: real local reset changes the password, revokes sessions and rejects reused or expired tokens', async ({
  page,
}, info) => {
  const connectionString = isolatedDatabase();
  const email = `f06b-reset-${randomBytes(8).toString('hex')}@example.test`;
  const password = `Synthetic-${randomBytes(18).toString('base64url')}`;
  const nextPassword = `Changed-${randomBytes(18).toString('base64url')}`;
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: baseURL },
    data: {
      name: 'СИНТЕТИКАЛЫҚ reset',
      email,
      password,
      adultConfirmed: true,
      privacyConsent: true,
    },
  });
  expect(signup.status()).toBe(200);
  await page.goto('/auth/forgot-password');
  await changeLocale(page, 'kk');
  await emailAuthForm(page).locator('input[name="email"]').fill(email);
  const requested = page.waitForResponse('**/api/auth/request-password-reset');
  await emailAuthForm(page).locator('button[type="submit"]').click();
  expect((await requested).status()).toBe(200);
  await expect(page.locator('main').getByRole('status')).toBeVisible();
  const token = await localResetToken(email);
  await page.goto(`/auth/reset-password?token=${encodeURIComponent(token)}`);
  await expect(page.locator('main #auth-heading')).toHaveText('Жаңа құпиясөз');
  await emailAuthForm(page).locator('input[name="password"]').fill(nextPassword);
  await emailAuthForm(page).locator('input[name="confirmPassword"]').fill(nextPassword);
  const reset = page.waitForResponse('**/api/auth/reset-password');
  await emailAuthForm(page).locator('button[type="submit"]').click();
  expect((await reset).status()).toBe(200);
  const changed = page.locator('main').getByRole('status');
  await expect(changed).toContainText('Құпиясөз өзгертілді. Жаңа құпиясөзбен кіріңіз.');
  await changeLocale(page, 'ru');
  await expect(changed).toContainText('Пароль изменён. Войдите с новым паролем.');
  await changeLocale(page, 'kk');
  await expect(changed).toContainText('Құпиясөз өзгертілді. Жаңа құпиясөзбен кіріңіз.');
  expect((await page.request.get('/api/profile')).status()).toBe(401);
  const replay = await page.request.post('/api/auth/reset-password', {
    headers: { Origin: baseURL },
    data: { token, newPassword: password },
  });
  expect(replay.ok()).toBe(false);
  await page.goto('/auth/login');
  await emailAuthForm(page).locator('input[name="email"]').fill(email);
  await emailAuthForm(page).locator('input[name="password"]').fill(nextPassword);
  await emailAuthForm(page).locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  const profileResponse = await page.request.get('/api/profile');
  expect(profileResponse.status()).toBe(200);
  const profile = parseDataResponse(profileDataSchema, await profileResponse.json()).data;
  expect(profile.email).toBe(email);
  const before = new Set(await readdir(path.join(process.cwd(), '.local', 'mail')));
  expect(
    (
      await page.request.post('/api/auth/request-password-reset', {
        headers: { Origin: baseURL },
        data: { email, redirectTo: `${baseURL}/auth/reset-password` },
      })
    ).status(),
  ).toBe(200);
  await expect
    .poll(async () =>
      (await readdir(path.join(process.cwd(), '.local', 'mail'))).some((file) => !before.has(file)),
    )
    .toBe(true);
  const expiredToken = await localResetToken(email);
  expect(expiredToken === token, 'A fresh reset request creates a distinct token').toBe(false);
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const expired = await db.verification.updateMany({
      where: { identifier: `reset-password:${expiredToken}`, value: profile.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect(expired.count).toBe(1);
    const response = await page.request.post('/api/auth/reset-password', {
      headers: { Origin: baseURL },
      data: { token: expiredToken, newPassword: password },
    });
    expect(response.ok()).toBe(false);
  } finally {
    await db.$disconnect();
  }
  await page.goto('/auth/reset-password?error=INVALID_TOKEN');
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Сілтеме жарамсыз немесе мерзімі өткен.',
  );
  await expect(page.locator('main input[name="password"]')).toHaveCount(0);
  await info.attach('local-reset-scope', {
    body: JSON.stringify({
      realAuthAndDatabase: true,
      mailFixture: 'Private local .local/mail output',
      externalMailDeliveryTested: false,
      resetSucceeded: true,
      replayRejected: true,
      ownExpiredVerificationRejected: true,
    }),
    contentType: 'application/json',
  });
});

test('F06b: synthetic profile feedback retranslates while original details and drafts survive', async ({
  page,
}, info) => {
  isolatedDatabase();
  await signInDemo(page, 'student');
  const beforeResponse = await page.request.get('/api/profile');
  expect(beforeResponse.status()).toBe(200);
  const before = parseDataResponse(profileDataSchema, await beforeResponse.json()).data;
  await page.goto('/student/profile');
  await changeLocale(page, 'kk');
  const editor = page.locator('main .profile-editor');
  await editor.locator('input[name="name"]').fill('СИНТЕТИКАЛЫҚ сақталмайтын профиль');
  await editor.locator('input[name="city"]').fill('Өзгермейтін синтетикалық қала');
  await editor.locator('input[name="skills"]').fill('Excel, Синтетикалық дағды');
  await editor.locator('input[name="formats"][value="hybrid"]').check();
  await editor.locator('input[name="isPublic"]').check();
  await page.getByRole('tab', { name: 'Портфолио', exact: true }).click();
  await page.getByRole('button', { name: 'Кейс қосу', exact: true }).click();
  const external = page.getByRole('form', { name: 'Кейс редакторы' });
  await external.locator('[name="title"]').fill('Синтетикалық сақталмайтын жұмыс');
  await external.locator('[name="url"]').fill('https://example.org/synthetic-unsaved-work');
  await external.locator('[name="description"]').fill('Бастапқы мәтін тіл ауысқанда сақталады.');
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();

  async function expectDraft() {
    await expect(editor.locator('input[name="name"]')).toHaveValue(
      'СИНТЕТИКАЛЫҚ сақталмайтын профиль',
    );
    await expect(editor.locator('input[name="city"]')).toHaveValue('Өзгермейтін синтетикалық қала');
    await expect(editor.locator('input[name="skills"]')).toHaveValue('Excel, Синтетикалық дағды');
    await expect(editor.locator('input[name="formats"][value="hybrid"]')).toBeChecked();
    await expect(editor.locator('input[name="isPublic"]')).toBeChecked();
    await expect(page.locator('form[aria-label] [name="title"]')).toHaveValue(
      'Синтетикалық сақталмайтын жұмыс',
    );
    await expect(page.locator('form[aria-label] [name="url"]')).toHaveValue(
      'https://example.org/synthetic-unsaved-work',
    );
    await expect(page.locator('form[aria-label] [name="description"]')).toHaveValue(
      'Бастапқы мәтін тіл ауысқанда сақталады.',
    );
  }

  let phase:
    'hold' | 'validation' | 'forbidden' | 'unavailable' | 'unknown' | 'network' | 'success' =
    'hold';
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const originalDetail =
    'Synthetic original server detail — unchanged in both interface languages.';
  const responses = {
    validation: { status: 400, code: 'VALIDATION_ERROR' },
    forbidden: { status: 403, code: 'FORBIDDEN' },
    unavailable: { status: 503, code: 'SERVICE_UNAVAILABLE' },
    unknown: { status: 422, code: 'SYNTHETIC_UNRECOGNISED_CODE' },
  } as const;
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    if (phase === 'hold') await hold;
    if (phase === 'network') return route.abort('failed');
    if (phase === 'success')
      return route.fulfill({ json: { data: { saved: true, role: 'student' } } });
    const response = responses[phase as keyof typeof responses];
    return route.fulfill({
      status: response.status,
      json: { code: response.code, error: originalDetail },
    });
  });
  const recorder = mutationRecorder(page);
  const submit = editor.locator('button[type="submit"]');
  const url = page.url();
  try {
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(submit).toContainText('Сақталуда…');
    await expect.poll(() => recorder.mutations.length).toBe(1);
    const pendingPosts = recorder.mutations.length;
    await changeLocale(page, 'ru');
    await expect(submit).toContainText('Сохраняем…');
    await expect(submit).toBeDisabled();
    await changeLocale(page, 'kk');
    await expect(submit).toContainText('Сақталуда…');
    await expectDraft();
    expect(recorder.mutations).toHaveLength(pendingPosts);
    phase = 'validation';
    release();
    const alert = editor.getByRole('alert');
    await expect(alert).toBeVisible();
    const checks = [
      {
        phase: 'validation',
        kk: 'Аты-жөніңізді, қаланы, сілтемелерді және профильдің басқа өрістерін тексеріңіз.',
        ru: 'Проверьте имя, город, ссылки и остальные поля профиля.',
      },
      {
        phase: 'forbidden',
        kk: 'Профильді сақтауға рұқсат жоқ. Аккаунтты тексеріп, бетті жаңартыңыз.',
        ru: 'Нет доступа к сохранению профиля. Проверьте аккаунт и обновите страницу.',
      },
      {
        phase: 'unavailable',
        kk: 'Профильді сақтау мүмкін болмады. Кейінірек қайталап көріңіз.',
        ru: 'Не удалось сохранить профиль. Повторите позже.',
      },
      {
        phase: 'unknown',
        kk: 'Профильді сақтау мүмкін болмады. Сервердің бастапқы хабарламасын тексеріңіз немесе кейінірек қайталаңыз.',
        ru: 'Не удалось сохранить профиль. Проверьте исходное сообщение сервера или повторите позже.',
      },
      {
        phase: 'network',
        kk: 'Сервер қолжетімсіз немесе уақытында жауап бермеді. Байланысты тексеріп, қайталаңыз.',
        ru: 'Сервер недоступен или не ответил вовремя. Проверьте соединение и повторите.',
      },
    ] as const;
    for (const check of checks) {
      if (check.phase !== 'validation') {
        phase = check.phase;
        await submit.click();
      }
      await expect(alert.locator('p').first()).toHaveText(check.kk);
      const posts = recorder.mutations.length;
      for (const locale of ['ru', 'kk'] as const) {
        await changeLocale(page, locale);
        await expect(alert.locator('p').first()).toHaveText(check[locale]);
        if (check.phase === 'network') await expect(alert.locator('[lang="und"]')).toHaveCount(0);
        else await expect(alert.locator('[lang="und"]')).toHaveText(originalDetail);
        await expectDraft();
        expect(page.url()).toBe(url);
        expect(recorder.mutations).toHaveLength(posts);
      }
    }
    phase = 'success';
    await submit.click();
    const success = editor.getByRole('status');
    await expect(success).toHaveText('Профиль сақталды.');
    const successPosts = recorder.mutations.length;
    await changeLocale(page, 'ru');
    await expect(success).toHaveText('Профиль сохранён.');
    await changeLocale(page, 'kk');
    await expect(success).toHaveText('Профиль сақталды.');
    await expectDraft();
    expect(recorder.mutations).toHaveLength(successPosts);
    expect(page.url()).toBe(url);
    const afterResponse = await page.request.get('/api/profile');
    expect(afterResponse.status()).toBe(200);
    expect(parseDataResponse(profileDataSchema, await afterResponse.json()).data).toEqual(before);
    await info.attach('synthetic-profile-feedback-scope', {
      body: JSON.stringify({
        fixture: 'Intercepted profile POST responses; database profile unchanged',
        actualSaveTested: false,
        syntheticSuccessOnly: true,
        originalUnknownServerDetailPreserved: true,
        automaticLocalePosts: 0,
      }),
      contentType: 'application/json',
    });
  } finally {
    recorder.stop();
    release();
    await page.unroute('**/api/profile');
  }
});

test('F06b: auth and student/client profile layouts across both languages, themes and widths', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  isolatedDatabase();
  let state = 0;
  for (const locale of ['ru', 'kk'] as const) {
    for (const theme of ['light', 'dark']) {
      for (const width of [375, 768, 1440, 1920]) {
        const screen = ['register', 'student', 'client'][state++ % 3];
        await page.setViewportSize({ width, height: 1000 });
        if (screen === 'register') await page.goto('/auth/register');
        else {
          await signInDemo(page, screen as 'student' | 'client');
          await page.goto(`/onboarding?role=${screen}`);
          await page
            .locator('main input[name="name"]')
            .fill('СИНТЕТИКАЛЫҚ ұзын есім — интерфейс өлшемін тексеру');
          await page.locator('main input[name="city"]').fill('Шығыс Қазақстан облысы — Өскемен');
        }
        await changeLocale(page, locale);
        const menu = page.locator('header button[aria-controls="header-navigation"]');
        if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
          await menu.click();
        await page.locator('header .theme-switch:not(.locale-switch) select').selectOption(theme);
        if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'true')
          await menu.click();
        await inspect(page, info, `auth-${screen}-${locale}-${theme}-${width}`);
      }
    }
  }
});
