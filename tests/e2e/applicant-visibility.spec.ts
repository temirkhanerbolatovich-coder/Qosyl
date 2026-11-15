import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, request, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import sharp from 'sharp';

const baseURL = 'http://localhost:3100';
const run = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const password = `Test-${randomBytes(20).toString('base64url')}`;
const headline = `Частный заголовок ${run}`;
const institution = `Частный вуз ${run}`;
const skill = `PrivateSkill${run}`;

async function readData<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `Unexpected HTTP ${response.status()}`).toBe(true);
  return (await response.json()).data as T;
}

async function createActor(role: 'student' | 'client', name: string) {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const registration = await api.post('/api/auth/sign-up/email', {
    data: {
      name,
      email: `${role}-${name.length}-${run}@example.test`,
      password,
      adultConfirmed: true,
      privacyConsent: true,
    },
  });
  expect(registration.ok()).toBe(true);
  const { user } = (await registration.json()) as { user: { id: string } };
  const profile = {
    role,
    name,
    city: 'Семей',
    ...(role === 'student'
      ? {
          headline,
          institution,
          studyYear: 3,
          skills: [skill],
          formats: ['remote'],
          weeklyHours: 5,
          isPublic: true,
        }
      : {
          organisationName: 'Тестовая организация',
          industry: 'Тест',
          contact: 'Тестовый контакт',
          description: 'Синтетический заказчик для проверки.',
        }),
  };
  await readData(await api.post('/api/profile', { data: profile }));
  return { api, id: user.id, name };
}

async function command<T>(
  api: APIRequestContext,
  action: string,
  fields: Record<string, unknown>,
): Promise<T> {
  return readData<T>(await api.post('/api/platform', { data: { action, ...fields } }));
}

async function createPublishedProject(
  client: APIRequestContext,
  admin: APIRequestContext,
  title: string,
) {
  const project = await command<{ id: string }>(client, 'createProject', {
    title,
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

type Applicant = {
  student: {
    id: string;
    name: string;
    profileAvailable: boolean;
    avatarRevision: string | null;
    confirmedWorks: number | null;
    studentProfile: {
      headline: string;
      institution: string;
      studyYear: number | null;
      skills: string[];
      isPublic: boolean;
    } | null;
  };
};

async function applicants(api: APIRequestContext, projectId: string) {
  return readData<{ applications: Applicant[] }>(
    await api.get('/api/platform', { params: { view: 'applications', projectId } }),
  );
}

test('owner sees only permitted candidate data and genuinely public confirmed work', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const guest = await request.newContext({ baseURL });
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
  const client = await createActor('client', 'Тестовый заказчик');
  const stranger = await createActor('client', 'Посторонний заказчик');
  const student = await createActor('student', 'Тестовый кандидат');
  const ownerContext = await browser.newContext({
    baseURL,
    storageState: await client.api.storageState(),
  });
  try {
    const photo = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const avatar = await readData<{ avatar: { revision: string } }>(
      await student.api.post('/api/profile/avatar', {
        headers: { 'Content-Type': 'image/png' },
        data: photo,
      }),
    );
    expect((await client.api.get(`/api/avatars/${student.id}`)).status()).toBe(404);
    const publishedAvatar = await readData<{ avatar: { revision: string } }>(
      await student.api.patch('/api/profile/avatar', {
        data: { revision: avatar.avatar.revision, isPublic: true },
      }),
    );
    expect((await client.api.get(`/api/avatars/${student.id}`)).status()).toBe(200);

    const firstProject = await createPublishedProject(
      client.api,
      admin,
      `Тест завершённой работы ${run}`,
    );
    const firstApplication = await command<{ id: string }>(student.api, 'applyToProject', {
      projectId: firstProject,
      message: 'Готов выполнить тестовую задачу и описать результат.',
      links: [],
    });
    await command(client.api, 'selectApplicant', {
      projectId: firstProject,
      applicationId: firstApplication.id,
    });
    const assigned = await readData<{ agreements: { id: string }[] }>(
      await client.api.get('/api/platform', { params: { view: 'work', id: firstProject } }),
    );
    await command(client.api, 'approveAgreement', {
      projectId: firstProject,
      agreementId: assigned.agreements[0].id,
    });
    await command(student.api, 'approveAgreement', {
      projectId: firstProject,
      agreementId: assigned.agreements[0].id,
    });
    await command(student.api, 'submitDeliverable', {
      projectId: firstProject,
      links: ['https://example.com/result'],
      notes: 'Синтетический результат с описанием методики.',
    });
    const submitted = await readData<{ submissions: { id: string }[] }>(
      await client.api.get('/api/platform', { params: { view: 'work', id: firstProject } }),
    );
    await command(client.api, 'acceptSubmission', {
      projectId: firstProject,
      submissionId: submitted.submissions[0].id,
    });
    const portfolio = {
      projectId: firstProject,
      title: 'Подтверждённая тестовая работа',
      summary: 'Публичное описание синтетической учебной работы.',
      role: 'Исполнитель',
      skills: ['Excel'],
      publicLinks: [],
      visibility: 'redacted_public',
    };
    await command(student.api, 'setPortfolio', portfolio);

    const secondProject = await createPublishedProject(
      client.api,
      admin,
      `Тест отклика кандидата ${run}`,
    );
    await command(student.api, 'applyToProject', {
      projectId: secondProject,
      message: 'Готов выполнить ещё одну тестовую задачу.',
      links: ['https://example.com/case'],
    });
    expect(
      (
        await stranger.api.get('/api/platform', {
          params: { view: 'applications', projectId: secondProject },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await guest.get('/api/platform', {
          params: { view: 'applications', projectId: secondProject },
        })
      ).status(),
    ).toBe(401);
    let candidate = (await applicants(client.api, secondProject)).applications[0].student;
    expect(candidate).toMatchObject({
      id: student.id,
      profileAvailable: true,
      avatarRevision: publishedAvatar.avatar.revision,
      confirmedWorks: 0,
    });
    expect(candidate.studentProfile).toMatchObject({
      headline,
      institution,
      studyYear: 3,
      skills: [skill],
      isPublic: true,
    });

    const work = await readData<{ portfolio: { updatedAt: string } }>(
      await client.api.get('/api/platform', { params: { view: 'work', id: firstProject } }),
    );
    await command(client.api, 'consentPortfolio', {
      projectId: firstProject,
      expectedUpdatedAt: work.portfolio.updatedAt,
    });
    candidate = (await applicants(client.api, secondProject)).applications[0].student;
    expect(candidate.confirmedWorks).toBe(1);
    const page = await ownerContext.newPage();
    await page.goto(`/client/projects/${secondProject}/applications`);
    await expect(page.getByRole('link', { name: 'Открыть профиль' })).toHaveAttribute(
      'href',
      `/talent/${student.id}`,
    );
    await expect(page.getByText(headline, { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: student.name })).toHaveAttribute(
      'src',
      new RegExp(`/api/avatars/${student.id}`),
    );
    await expect(page.getByRole('link', { name: /example.com\/case/ })).toBeVisible();

    await command(student.api, 'setPortfolio', {
      ...portfolio,
      title: 'Изменённая тестовая работа',
    });
    expect(
      (await applicants(client.api, secondProject)).applications[0].student.confirmedWorks,
    ).toBe(0);

    const profileData = {
      role: 'student',
      name: student.name,
      city: 'Семей',
      headline,
      institution,
      studyYear: 3,
      skills: [skill],
      formats: ['remote'],
      weeklyHours: 5,
    };
    await readData(
      await student.api.post('/api/profile', {
        data: { ...profileData, isPublic: true, hiddenFields: ['headline', 'education', 'skills'] },
      }),
    );
    const hidden = await applicants(client.api, secondProject);
    expect(JSON.stringify(hidden)).not.toContain(headline);
    expect(JSON.stringify(hidden)).not.toContain(institution);
    expect(JSON.stringify(hidden)).not.toContain(skill);
    expect(hidden.applications[0].student.studentProfile).toMatchObject({
      headline: '',
      institution: '',
      studyYear: null,
      skills: [],
    });

    await readData(
      await student.api.post('/api/profile', {
        data: {
          ...profileData,
          isPublic: false,
          hiddenFields: ['headline', 'education', 'skills'],
        },
      }),
    );
    candidate = (await applicants(client.api, secondProject)).applications[0].student;
    expect(candidate).toMatchObject({
      profileAvailable: false,
      avatarRevision: null,
      confirmedWorks: null,
    });
    expect((await client.api.get(`/api/avatars/${student.id}`)).status()).toBe(404);
    await page.reload();
    await expect(page.getByText('Профиль скрыт исполнителем')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Открыть профиль' })).toHaveCount(0);
    await expect(page.getByText(headline)).toHaveCount(0);
    await expect(page.getByText(institution)).toHaveCount(0);
    await expect(page.getByText(skill)).toHaveCount(0);
  } finally {
    await ownerContext.close();
    await Promise.all(
      [admin, guest, client.api, stranger.api, student.api].map((api) => api.dispose()),
    );
  }
});
