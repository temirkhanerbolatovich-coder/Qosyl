import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, request, test, type APIRequestContext, type APIResponse } from '@playwright/test';

const baseURL = 'http://localhost:3100';
const run = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const password = `Test-${randomBytes(20).toString('base64url')}`;

async function readData<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `Unexpected HTTP ${response.status()}`).toBe(true);
  return (await response.json()).data as T;
}

async function command<T>(
  api: APIRequestContext,
  action: string,
  fields: Record<string, unknown>,
): Promise<T> {
  return readData<T>(await api.post('/api/platform', { data: { action, ...fields } }));
}

/** The server limits sign-ups per minute on purpose; wait for the window instead of switching it off. */
async function signUp(api: APIRequestContext, data: Record<string, unknown>) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await api.post('/api/auth/sign-up/email', { data });
    if (response.status() !== 429) return response;
    const seconds = Number(response.headers()['x-retry-after']) || 15;
    await new Promise((resolve) => setTimeout(resolve, Math.min(seconds, 65) * 1000 + 500));
  }
  throw new Error('Sign-up stayed rate limited after waiting for the window.');
}

async function createActor(role: 'student' | 'client', name: string) {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const email = `${role}-return-${name.length}-${run}@example.test`;
  const registration = await signUp(api, {
    name,
    email,
    password,
    adultConfirmed: true,
    privacyConsent: true,
  });
  expect(
    registration.ok(),
    `Sign-up failed with HTTP ${registration.status()}: ${await registration.text()}`,
  ).toBe(true);
  await readData(
    await api.post('/api/profile', {
      data:
        role === 'student'
          ? {
              role,
              name,
              city: 'Семей',
              skills: ['Excel'],
              formats: ['remote'],
              weeklyHours: 5,
              isPublic: true,
            }
          : {
              role,
              name,
              city: 'Семей',
              organisationName: 'Тестовая организация',
              industry: 'Тест',
              contact: 'Тестовый контакт',
              description: 'Синтетический заказчик для проверки.',
            },
    }),
  );
  return { api, email };
}

async function publishedProject(client: APIRequestContext, admin: APIRequestContext) {
  const project = await command<{ id: string }>(client, 'createProject', {
    title: `Возврат после входа ${run}`,
    category: 'spreadsheets',
    problem: 'Нужно проверить синтетические данные в таблице.',
    description: 'Проверка учебных данных без настоящих персональных сведений.',
    deliverables: 'Таблица с результатами и коротким пояснением.',
    acceptanceCriteria: ['Итоговые суммы совпадают.'],
    skills: ['Excel'],
    difficulty: 'beginner_friendly',
    mode: 'remote',
    city: '',
    locationPrivate: '',
    contactPrivate: '',
    budgetKzt: 12000,
    estimatedHours: 4,
    dueAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    preferredTime: '',
  });
  await command(client, 'submitForModeration', { projectId: project.id });
  await command(admin, 'moderateProject', {
    projectId: project.id,
    approve: true,
    reason: 'Синтетическая проверка.',
  });
  return project.id;
}

async function adminSession() {
  const admin = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const demo = JSON.parse(await readFile('.local/demo-accounts.json', 'utf8')) as {
    admin: string;
    password: string;
  };
  expect(
    (
      await admin.post('/api/auth/sign-in/email', {
        data: { email: demo.admin, password: demo.password },
      })
    ).ok(),
  ).toBe(true);
  return admin;
}

function emailForm(page: import('@playwright/test').Page) {
  return page.locator('main form').filter({ has: page.locator('input[name="email"]') });
}

type Actor = Awaited<ReturnType<typeof createActor>>;
let admin: APIRequestContext;
let client: Actor;
let student: Actor;
let projectId: string;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  admin = await adminSession();
  client = await createActor('client', 'Заказчик возврата');
  student = await createActor('student', 'Студент возврата');
  projectId = await publishedProject(client.api, admin);
});

test.afterAll(async () => {
  await Promise.all([admin?.dispose(), client?.api.dispose(), student?.api.dispose()]);
});

test('a guest who starts an application is brought back to the same project after signing up', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  {
    const projectPath = `/projects/${projectId}?apply=1`;

    await page.goto(`/projects/${projectId}`);
    await page.getByRole('link', { name: /Откликнуться бесплатно/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/auth/register\\?next=${encodeURIComponent(projectPath).replace(/\./g, '\\.')}$`),
    );
    await expect(page.getByTestId('auth-next-note')).toBeVisible();
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: testInfo.outputPath('register-with-next-375.png') });
    if (viewport) await page.setViewportSize(viewport);
    // The other way into the same destination keeps it too.
    await expect(page.getByRole('link', { name: 'Уже есть аккаунт? Войти' })).toHaveAttribute(
      'href',
      `/auth/login?next=${encodeURIComponent(projectPath)}`,
    );

    const form = emailForm(page);
    await form.locator('input[name="name"]').fill('Вернувшийся студент');
    await form.locator('input[name="email"]').fill(`guest-return-${run}@example.test`);
    await form.locator('input[name="password"]').fill(password);
    await form.locator('input[name="confirmPassword"]').fill(password);
    await form.locator('input[name="adultConfirmed"]').check();
    await form.locator('input[name="privacyConsent"]').check();
    await form.locator('button[type="submit"]').click();

    // A new account still needs a role: onboarding comes first, as a performer, and remembers the way back.
    await expect(page).toHaveURL(
      new RegExp(
        `/onboarding\\?role=student&next=${encodeURIComponent(projectPath)}$`.replace(/\./g, '\\.'),
      ),
    );
    const editor = page.locator('main .profile-editor');
    await expect(
      editor.getByRole('button', { name: 'Я исполнитель', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await editor.locator('input[name="city"]').fill('Семей');
    await editor.locator('input[name="discipline"]').fill('Анализ данных');
    await editor.locator('input[name="institution"]').fill('Синтетический вуз');
    await editor.locator('textarea[name="bio"]').fill('Учебная проверка возврата к проекту.');
    await editor.locator('input[name="skills"]').fill('Excel');
    await editor.getByRole('button', { name: 'Сохранить и продолжить' }).click();

    await expect(page).toHaveURL(`${baseURL}${projectPath}`);
    const message = page.locator('textarea[name="message"]');
    await expect(message).toBeFocused();
    await message.fill('Готов выполнить задачу и проверить оба критерия приёмки.');
    await page.getByRole('button', { name: 'Отправить отклик бесплатно' }).click();
    await expect(
      page.locator('main [role=status]').filter({ hasText: 'Отклик отправлен' }),
    ).toBeVisible();
  }
});

test('sign-in follows a safe return address and ignores addresses that leave the site', async ({
  page,
}) => {
  test.setTimeout(120_000);
  {
    const projectPath = `/projects/${projectId}?apply=1`;

    // Addresses that point elsewhere are dropped before anything is rendered or remembered.
    for (const hostile of [
      'https://evil.example/',
      '//evil.example',
      '/\\evil.example',
      '/.//evil.example',
      '/auth/login',
    ]) {
      await page.goto(`/auth/login?next=${encodeURIComponent(hostile)}`);
      await expect(page.getByTestId('auth-next-note')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Зарегистрироваться' })).toHaveAttribute(
        'href',
        '/auth/register',
      );
    }

    // Even if one slipped through to the form, signing in lands on the cabinet, never on another site.
    await page.goto(`/auth/login?next=${encodeURIComponent('/.//evil.example')}`);
    let form = emailForm(page);
    await form.locator('input[name="email"]').fill(student.email);
    await form.locator('input[name="password"]').fill(password);
    await form.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
    await page.context().clearCookies();

    // A real same-site address is followed, and the application form is ready to type in.
    await page.goto(`/auth/login?next=${encodeURIComponent(projectPath)}`);
    await expect(page.getByTestId('auth-next-note')).toBeVisible();
    form = emailForm(page);
    await form.locator('input[name="email"]').fill(student.email);
    await form.locator('input[name="password"]').fill(password);
    await form.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(`${baseURL}${projectPath}`);
    await expect(page.locator('textarea[name="message"]')).toBeFocused();
  }
});
