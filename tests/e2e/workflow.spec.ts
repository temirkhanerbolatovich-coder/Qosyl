import { randomBytes, randomUUID } from 'node:crypto';
import type { ViewData } from '../../src/contracts/api-responses';
import {
  contentIntakeDataSchema,
  contentMutationDataSchema,
  contentDetailDataSchema,
  publicContentDataSchema,
} from '../../src/contracts/content-intake';
import { readFile, readdir } from 'node:fs/promises';
import {
  leadListDataSchema,
  leadDetailDataSchema,
  leadMutationDataSchema,
  leadHandoffsDataSchema,
  leadConversionDataSchema,
} from '../../src/contracts/leads';
import path from 'node:path';
import {
  parseCommandResponse,
  parseDataResponse,
  parseViewResponse,
} from '../../src/contracts/api-response-validation';
import {
  apiErrorSchema,
  commandDataSchemas,
  profileDataSchema,
  profileSavedDataSchema,
  publicProjectDataSchema,
  ownerProjectDataSchema,
  viewDataSchemas,
  okHealthSchema,
  type PlatformView,
} from '../../src/contracts/api-responses';
import type { Action } from '../../src/lib/validation';
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type Page,
} from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const run = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const password = `Test-${randomBytes(20).toString('base64url')}`;
const title = `E2E ${run}: анализ обезличенной таблицы`;
const contractCommands = new Set<string>();
const contractViews = new Set<string>();
const actorIds = new WeakMap<APIRequestContext, string>();

interface Actor {
  id: string;
  email: string;
  api: APIRequestContext;
}

interface Project {
  id: string;
  status: string;
  demo: boolean;
  title: string;
  budgetKzt: number;
  locationPrivate?: string;
  contactPrivate?: string;
  clientClosedAt?: string | null;
  studentClosedAt?: string | null;
}

interface Application {
  id: string;
  studentId: string;
  status: string;
}

interface Work {
  project: Project;
  agreements: {
    id: string;
    number: number;
    snapshotJson: Record<string, unknown>;
    clientApprovedAt: string | null;
    studentApprovedAt: string | null;
  }[];
  submissions: {
    id: string;
    notes: string;
    revisions: { notes: string; criteriaIndexes: number[] }[];
  }[];
  milestones: { id: string; done: boolean }[];
  events: { id: string; action: string; createdAt: string }[];
  payment: { status: string; clientPaidAt: string | null; studentReceivedAt: string | null } | null;
  portfolio: {
    updatedAt: string;
    clientConsentAt: string | null;
    studentConsentAt: string | null;
  } | null;
  reviews: { id: string; authorId: string; recipientId: string }[];
}

const projectInput = {
  title,
  category: 'spreadsheets',
  problem: 'Нужно сгруппировать обезличенные учебные строки по категориям.',
  description:
    'Подготовить сводную таблицу на основе вымышленных данных тестового сценария. Персональные данные не используются.',
  deliverables: 'Таблица с итогами по категориям и короткое описание методики.',
  acceptanceCriteria: [
    'Итоги по категориям сходятся с общей суммой.',
    'Методика расчета описана без персональных данных.',
  ],
  skills: ['Excel', 'Аналитика'],
  difficulty: 'beginner_friendly',
  mode: 'onsite',
  city: 'Усть-Каменогорск',
  locationPrivate: `ПРИВАТНЫЙ АДРЕС ${run}`,
  contactPrivate: `ПРИВАТНЫЙ КОНТАКТ ${run}`,
  budgetKzt: 12000,
  estimatedHours: 4,
  dueAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  preferredTime: 'Суббота, по согласованию',
};

async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `HTTP ${response.status()} ${response.url()}`).toBe(true);
  const body: unknown = await response.json();
  if (new URL(response.url()).pathname === '/api/profile') {
    parseDataResponse(profileSavedDataSchema, body);
  }
  return body as T;
}

async function mutate<T = { ok: boolean }>(
  api: APIRequestContext,
  action: Action,
  data: Record<string, unknown> = {},
): Promise<T> {
  const response = await api.post('/api/platform', { data: { action, ...data } });
  const body = await json<{ data: T }>(response);
  parseCommandResponse(action, body);
  contractCommands.add(action);
  return body.data;
}

async function view<T>(
  api: APIRequestContext,
  selectedView: PlatformView,
  params: Record<string, string> = {},
): Promise<T> {
  const response = await api.get('/api/platform', { params: { view: selectedView, ...params } });
  const body = await json<{ data: T }>(response);
  parseViewResponse(selectedView, body);
  if (selectedView === 'project') {
    const project = (body.data as { project: { clientId: string } }).project;
    parseDataResponse(
      project.clientId === actorIds.get(api) ? ownerProjectDataSchema : publicProjectDataSchema,
      body,
    );
  }
  contractViews.add(selectedView);
  return body.data;
}

async function denied(
  api: APIRequestContext,
  action: string,
  data: Record<string, unknown>,
  status: number | number[] = [403, 409],
): Promise<void> {
  const response = await api.post('/api/platform', { data: { action, ...data } });
  expect(Array.isArray(status) ? status : [status]).toContain(response.status());
  const body = (await response.json()) as { error?: unknown };
  apiErrorSchema.parse(body);
  expect(typeof body.error).toBe('string');
}

async function newApi(): Promise<APIRequestContext> {
  return request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
}

async function register(
  role: 'client' | 'student',
  name: string,
  isPublic = false,
): Promise<Actor> {
  const api = await newApi();
  const email = `${name}-${run}@example.test`;
  const result = await json<{ user: { id: string } }>(
    await api.post('/api/auth/sign-up/email', {
      data: { name: `ТЕСТ ${name}`, email, password, adultConfirmed: true, privacyConsent: true },
    }),
  );
  await json(
    await api.post('/api/profile', {
      data: {
        role,
        name: `ТЕСТ ${name}`,
        city: 'Усть-Каменогорск',
        ...(role === 'student'
          ? {
              skills: ['Excel'],
              formats: ['remote', 'onsite'],
              weeklyHours: 5,
              isPublic,
              externalWorks: [
                {
                  title: 'Тестовый пример',
                  description: 'Синтетическая работа',
                  url: 'https://example.com/work',
                },
              ],
            }
          : {
              organisationName: `ТЕСТ организация ${name}`,
              industry: 'Учебный сценарий',
              contact: 'Не настоящий контакт',
              description: 'Вымышленная организация для автоматической проверки.',
            }),
      },
    }),
  );
  actorIds.set(api, result.user.id);
  return { id: result.user.id, email, api };
}

async function pageFor(browser: Browser, actor: Actor, width = 390): Promise<Page> {
  const context = await browser.newContext({
    storageState: await actor.api.storageState(),
    viewport: { width, height: width === 390 ? 844 : 1000 },
  });
  return context.newPage();
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

async function approve(actor: Actor, projectId: string): Promise<void> {
  const work = await view<Work>(actor.api, 'work', { id: projectId });
  const latest = [...work.agreements].sort((a, b) => b.number - a.number)[0];
  await mutate(actor.api, 'approveAgreement', { projectId, agreementId: latest.id });
}

async function consent(actor: Actor, projectId: string): Promise<void> {
  const work = await view<Work>(actor.api, 'work', { id: projectId });
  await mutate(actor.api, 'consentPortfolio', {
    projectId,
    expectedUpdatedAt: work.portfolio!.updatedAt,
  });
}

test.describe.serial('MVP на настоящем PostgreSQL', () => {
  let guest: APIRequestContext;
  let admin: Actor;
  let client: Actor;
  let student: Actor;
  let competitor: Actor;
  let stranger: Actor;
  let projectId: string;
  let applicationId: string;
  let competitorApplicationId: string;

  test.beforeAll(async () => {
    guest = await newApi();
    const demo = JSON.parse(
      await readFile(path.join(process.cwd(), '.local', 'demo-accounts.json'), 'utf8'),
    ) as { password: string; admin: string };
    const adminApi = await newApi();
    const signedIn = await json<{ user: { id: string } }>(
      await adminApi.post('/api/auth/sign-in/email', {
        data: { email: demo.admin, password: demo.password },
      }),
    );
    admin = { id: signedIn.user.id, email: demo.admin, api: adminApi };
    actorIds.set(adminApi, admin.id);
    client = await register('client', 'client');
    student = await register('student', 'student', true);
    competitor = await register('student', 'competitor');
    stranger = await register('client', 'stranger');
  });

  test.afterAll(async () => {
    await Promise.all(
      [guest, admin?.api, client?.api, student?.api, competitor?.api, stranger?.api]
        .filter(Boolean)
        .map((api) => api.dispose()),
    );
  });

  test('черновик скрыт, модерация обязательна, приватные поля и роли защищены', async () => {
    const health = await guest.get('/api/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    okHealthSchema.parse(await health.json());
    const invalidFilters: Record<string, string>[] = [
      { page: '1.5' },
      { minBudget: '2147483648' },
      { minBudget: '200', maxBudget: '100' },
      { dueBefore: '2026-02-31' },
      { category: 'unknown' },
    ];
    for (const filters of invalidFilters) {
      const response = await guest.get('/api/platform', {
        params: { view: 'catalog', ...filters },
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(response.headers()['cache-control']).toContain('no-store');
    }
    const unsupportedType = await client.api.post('/api/platform', {
      headers: { 'Content-Type': 'application/json-invalid' },
      data: JSON.stringify({ action: 'createProject' }),
    });
    expect(unsupportedType.status()).toBe(415);
    const noConsent = await guest.post('/api/auth/sign-up/email', {
      data: { name: 'ТЕСТ без согласия', email: `no-consent-${run}@example.test`, password },
    });
    expect(noConsent.status()).toBe(400);
    const oversized = await client.api.post('/api/platform', {
      data: { action: 'createProject', description: 'x'.repeat(70_000) },
    });
    expect(oversized.status()).toBe(413);
    const malformed = await client.api.post('/api/platform', {
      headers: { 'Content-Type': 'application/json' },
      data: '{',
    });
    expect(malformed.status()).toBe(400);
    const created = await mutate<Project>(client.api, 'createProject', projectInput);
    projectId = created.id;
    await mutate(client.api, 'updateProject', { projectId, ...projectInput });
    expect(created.status).toBe('draft');
    expect(
      (await guest.get('/api/platform', { params: { view: 'project', id: projectId } })).status(),
    ).toBe(404);
    await denied(stranger.api, 'updateProject', { ...projectInput, projectId }, 403);
    await denied(student.api, 'moderateProject', { projectId, approve: true }, 403);
    await denied(client.api, 'createProject', { ...projectInput, budgetKzt: 0 }, [400, 422]);
    expect(
      (
        await student.api.post('/api/profile', {
          data: { role: 'admin', name: 'ТЕСТ роль', city: 'Алматы' },
        })
      ).status(),
    ).toBe(400);
    await mutate(client.api, 'submitForModeration', { projectId });
    const moderationView = await view<{ project: Project }>(admin.api, 'project', {
      id: projectId,
    });
    expect(moderationView.project.status).toBe('pending_moderation');
    expect(moderationView.project).not.toHaveProperty('contactPrivate');
    const moderationQueue = await view<{ projects: Project[] }>(admin.api, 'admin');
    const queuedProject = moderationQueue.projects.find((item) => item.id === projectId);
    expect(queuedProject).toBeDefined();
    expect(queuedProject).not.toHaveProperty('contactPrivate');
    expect(queuedProject).not.toHaveProperty('locationPrivate');
    for (const api of [guest, student.api, client.api]) {
      const deniedQueue = await api.get('/api/platform?view=admin');
      expect(deniedQueue.status()).toBe(api === guest ? 401 : 403);
    }
    expect(
      (await view<{ projects: Project[] }>(guest, 'catalog', { q: run })).projects,
    ).toHaveLength(0);
    await mutate(admin.api, 'moderateProject', {
      projectId,
      approve: false,
      reason: 'Уточните конкретный объем обезличенных данных.',
    });
    const returned = await view<{ project: Project & { moderationReason: string } }>(
      client.api,
      'project',
      { id: projectId },
    );
    expect(returned.project.status).toBe('draft');
    expect(returned.project.moderationReason).toContain('Уточните');
    await mutate(client.api, 'submitForModeration', { projectId });
    await mutate(admin.api, 'moderateProject', {
      projectId,
      approve: true,
      reason: 'Тестовый ограниченный объем и критерии проверены.',
    });
    const visible = await view<{ project: Project }>(guest, 'project', { id: projectId });
    expect(visible.project.status).toBe('published');
    expect(visible.project).not.toHaveProperty('locationPrivate');
    expect(visible.project).not.toHaveProperty('contactPrivate');
    expect(JSON.stringify(visible)).not.toContain('ПРИВАТНЫЙ');
    const headers = (await guest.get(`/projects/${projectId}`)).headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    const filtered = await view<{ projects: Project[] }>(guest, 'catalog', {
      q: run,
      mode: 'onsite',
      city: 'Усть-Каменогорск',
      minBudget: '10000',
      maxHours: '5',
      skill: 'Excel',
    });
    expect(filtered.projects.map((project) => project.id)).toContain(projectId);
    expect(
      (await view<{ projects: Project[] }>(guest, 'catalog', { q: run, maxBudget: '1000' }))
        .projects,
    ).toHaveLength(0);
    const csrf = await client.api.post('/api/platform', {
      headers: { Origin: 'https://untrusted.example' },
      data: { action: 'submitForModeration', projectId },
    });
    expect(csrf.status()).toBe(403);
  });

  test('бесплатные отклики, редактирование и отзыв, один исполнитель', async () => {
    await json(
      await client.api.post('/api/profile', {
        data: {
          role: 'student',
          name: 'ТЕСТ client',
          city: 'Усть-Каменогорск',
          skills: ['Excel'],
          formats: ['onsite'],
        },
      }),
    );
    await denied(
      client.api,
      'applyToProject',
      { projectId, message: 'Не должен откликнуться на свой собственный заказ.', links: [] },
      403,
    );
    await mutate(student.api, 'applyToProject', {
      projectId,
      message: 'Готов выполнить ограниченную задачу и показать методику расчета.',
      links: [],
    });
    const appliedDetail = await view<{ application: Application | null }>(student.api, 'project', {
      id: projectId,
    });
    expect(appliedDetail.application?.studentId).toBe(student.id);
    await denied(
      student.api,
      'applyToProject',
      { projectId, message: 'Повторный активный отклик должен быть запрещен.', links: [] },
      409,
    );
    const applications = await view<{ applications: Application[] }>(client.api, 'applications', {
      projectId,
    });
    applicationId = applications.applications.find((item) => item.studentId === student.id)!.id;
    await mutate(student.api, 'updateApplication', {
      applicationId,
      message: 'Уточнение: могу работать в субботу, до четырех часов.',
      links: [],
    });
    await denied(competitor.api, 'withdrawApplication', { applicationId }, 403);
    await mutate(competitor.api, 'applyToProject', {
      projectId,
      message: 'Второй кандидат для проверки конкурентного назначения.',
      links: [],
    });
    const second = await view<{ applications: Application[] }>(client.api, 'applications', {
      projectId,
    });
    competitorApplicationId = second.applications.find(
      (item) => item.studentId === competitor.id,
    )!.id;
    await mutate(competitor.api, 'withdrawApplication', { applicationId: competitorApplicationId });
    await mutate(competitor.api, 'applyToProject', {
      projectId,
      message: 'Повторно подаю отозванный отклик до назначения исполнителя.',
      links: [],
    });
    expect(
      (
        await stranger.api.get('/api/platform', { params: { view: 'applications', projectId } })
      ).status(),
    ).toBe(403);
    await mutate(client.api, 'selectApplicant', { projectId, applicationId });
    const selected = await view<{ applications: Application[] }>(client.api, 'applications', {
      projectId,
    });
    expect(selected.applications.find((item) => item.id === applicationId)?.status).toBe(
      'selected',
    );
    expect(selected.applications.find((item) => item.id === competitorApplicationId)?.status).toBe(
      'not_selected',
    );
    await denied(
      client.api,
      'selectApplicant',
      { projectId, applicationId: competitorApplicationId },
      409,
    );
    expect(
      (
        await stranger.api.get('/api/platform', { params: { view: 'work', id: projectId } })
      ).status(),
    ).toBe(403);
    await denied(
      student.api,
      'updateApplication',
      { applicationId, message: 'После назначения редактирование недоступно.', links: [] },
      409,
    );
  });

  test('двустороннее согласование и новая версия сохраняют прежнюю историю', async () => {
    const assignedWork = await view<Work>(student.api, 'work', { id: projectId });
    expect(JSON.stringify(assignedWork)).not.toContain('ПРИВАТНЫЙ АДРЕС');
    expect(JSON.stringify(await view(student.api, 'dashboard'))).not.toContain('ПРИВАТНЫЙ АДРЕС');
    await denied(
      student.api,
      'submitDeliverable',
      {
        projectId,
        links: ['https://example.com/result'],
        notes: 'Нельзя сдать работу до согласования.',
      },
      409,
    );
    await denied(
      client.api,
      'acceptSubmission',
      { projectId, submissionId: 'missing-submission' },
      409,
    );
    await approve(client, projectId);
    expect((await view<Work>(student.api, 'work', { id: projectId })).project.status).toBe(
      'assigned',
    );
    await denied(
      student.api,
      'submitDeliverable',
      {
        projectId,
        links: ['https://example.com/result'],
        notes: 'Одного подтверждения недостаточно.',
      },
      409,
    );
    await approve(student, projectId);
    const original = await view<Work>(client.api, 'work', { id: projectId });
    expect(original.project.status).toBe('in_progress');
    const versionOne = original.agreements.find((item) => item.number === 1)!;
    expect(versionOne.clientApprovedAt).toBeTruthy();
    expect(versionOne.studentApprovedAt).toBeTruthy();
    const revisedPrivate = `НОВЫЙ ПРИВАТНЫЙ АДРЕС ${run}`;
    await mutate(client.api, 'proposeAgreement', {
      ...projectInput,
      projectId,
      budgetKzt: 14000,
      locationPrivate: revisedPrivate,
    });
    const revised = await view<Work>(student.api, 'work', { id: projectId });
    expect(revised.project.status).toBe('assigned');
    expect(revised.agreements).toHaveLength(2);
    expect(revised.agreements.find((item) => item.number === 1)).toEqual(versionOne);
    expect(JSON.stringify(revised)).not.toContain(revisedPrivate);
    await denied(student.api, 'approveAgreement', { projectId, agreementId: versionOne.id }, 409);
    await approve(client, projectId);
    await approve(student, projectId);
    const agreed = await view<Work>(student.api, 'work', { id: projectId });
    expect(agreed.project.status).toBe('in_progress');
    expect(agreed.project.budgetKzt).toBe(14000);
    if (agreed.milestones.length) {
      await mutate(student.api, 'toggleMilestone', {
        projectId,
        milestoneId: agreed.milestones[0].id,
      });
      const afterToggle = await view<Work>(student.api, 'work', { id: projectId });
      expect(afterToggle.milestones.map((item) => item.id)).toEqual(
        agreed.milestones.map((item) => item.id),
      );
      expect(afterToggle.milestones.find((item) => item.id === agreed.milestones[0].id)?.done).toBe(
        true,
      );
    }
    await denied(
      student.api,
      'createReview',
      { projectId, rating: 5, body: 'До приемки оставлять отзыв нельзя.' },
      409,
    );
  });

  test('сдача, конкретные правки, повторная сдача и независимый учет оплаты', async () => {
    await denied(
      student.api,
      'submitDeliverable',
      {
        projectId,
        links: ['javascript:alert(1)'],
        notes: 'Небезопасная ссылка должна отклоняться.',
      },
      [400, 422],
    );
    await mutate(student.api, 'submitDeliverable', {
      projectId,
      links: [`https://example.com/private-result/${run}`],
      notes: 'Первая сдача обезличенной таблицы с описанием методики.',
    });
    const submitted = await view<Work>(client.api, 'work', { id: projectId });
    const firstSubmission = submitted.submissions[0].id;
    expect(submitted.project.status).toBe('submitted');
    await denied(
      client.api,
      'requestChanges',
      {
        projectId,
        submissionId: firstSubmission,
        notes: 'Замечания должны ссылаться на существующий критерий.',
        criteriaIndexes: [999],
      },
      [400, 409, 422],
    );
    await mutate(client.api, 'requestChanges', {
      projectId,
      submissionId: firstSubmission,
      notes: 'По критерию 1 добавьте строку общей суммы для сверки.',
      criteriaIndexes: [0],
    });
    expect((await view<Work>(student.api, 'work', { id: projectId })).project.status).toBe(
      'changes_requested',
    );
    await mutate(student.api, 'submitDeliverable', {
      projectId,
      links: [`https://example.com/private-result-v2/${run}`],
      notes: 'Добавлена контрольная строка общей суммы. Критерий 1 выполнен.',
    });
    const repeated = await view<Work>(client.api, 'work', { id: projectId });
    expect(repeated.submissions).toHaveLength(2);
    const latest = repeated.submissions.find((item) => item.id !== firstSubmission)!;
    expect(
      repeated.submissions.find((item) => item.id === firstSubmission)?.revisions,
    ).toHaveLength(1);
    await denied(client.api, 'acceptSubmission', { projectId, submissionId: firstSubmission }, 409);
    await mutate(client.api, 'acceptSubmission', { projectId, submissionId: latest.id });
    const accepted = await view<Work>(client.api, 'work', { id: projectId });
    expect(accepted.project.status).toBe('accepted');
    expect(accepted.payment?.status ?? 'not_reported').toBe('not_reported');
    await denied(
      student.api,
      'acknowledgePayment',
      { projectId, status: 'reported_paid_by_client' },
      403,
    );
    await mutate(client.api, 'acknowledgePayment', {
      projectId,
      status: 'reported_paid_by_client',
    });
    const reported = await view<Work>(student.api, 'work', { id: projectId });
    expect(reported.payment?.status).toBe('reported_paid_by_client');
    expect(reported.payment?.studentReceivedAt).toBeNull();
    await mutate(client.api, 'closeProject', { projectId });
    expect((await view<Work>(student.api, 'work', { id: projectId })).project.status).toBe(
      'accepted',
    );
    await mutate(student.api, 'closeProject', { projectId });
    const closed = await view<Work>(student.api, 'work', { id: projectId });
    expect(closed.project.status).toBe('completed');
    expect(closed.payment?.status).toBe('reported_paid_by_client');
    await mutate(student.api, 'acknowledgePayment', {
      projectId,
      status: 'confirmed_received_by_student',
    });
    const paid = await view<Work>(student.api, 'work', { id: projectId });
    expect(paid.payment?.status).toBe('confirmed_received_by_student');
    expect(paid.payment?.clientPaidAt).toBeTruthy();
    expect(paid.payment?.studentReceivedAt).toBeTruthy();
    expect(new Set(paid.events.map((event) => event.id)).size).toBe(paid.events.length);
    expect(paid.events.length).toBeGreaterThan(10);
  });

  test('публичное портфолио требует обоих согласий, отзывы принадлежат участникам', async () => {
    const publicTitle = `Согласованный публичный итог ${run}`;
    await mutate(student.api, 'setPortfolio', {
      projectId,
      title: publicTitle,
      summary: 'Обезличенная сводная таблица, сверенные суммы и описанная методика.',
      role: 'Аналитик таблиц',
      skills: ['Excel'],
      publicLinks: [`https://example.com/public-summary/${run}`],
      visibility: 'redacted_public',
    });
    await consent(student, projectId);
    expect(await (await guest.get(`/talent/${student.id}`)).text()).not.toContain(publicTitle);
    const currentPortfolio = (await view<Work>(student.api, 'work', { id: projectId })).portfolio!;
    await denied(
      stranger.api,
      'consentPortfolio',
      { projectId, expectedUpdatedAt: currentPortfolio.updatedAt },
      403,
    );
    await consent(client, projectId);
    const visibleProfile = await (await guest.get(`/talent/${student.id}`)).text();
    expect(visibleProfile).toContain(publicTitle);
    expect(visibleProfile).not.toContain(`/private-result/${run}`);
    expect(visibleProfile).not.toContain('ПРИВАТНЫЙ АДРЕС');
    await mutate(client.api, 'createReview', {
      projectId,
      rating: 5,
      body: 'Учебный тест: результат принят по заранее указанным критериям.',
    });
    await mutate(student.api, 'createReview', {
      projectId,
      rating: 4,
      body: 'Учебный тест: объем и замечания были понятны заранее.',
    });
    await denied(
      client.api,
      'createReview',
      { projectId, rating: 5, body: 'Повторный отзыв того же автора должен быть запрещен.' },
      409,
    );
    await denied(
      stranger.api,
      'createReview',
      { projectId, rating: 5, body: 'Посторонний не может создать отзыв о чужом заказе.' },
      403,
    );
    const reviewed = await view<Work>(student.api, 'work', { id: projectId });
    expect(reviewed.reviews).toHaveLength(2);
    expect(reviewed.reviews.every((review) => review.authorId !== review.recipientId)).toBe(true);
    await mutate(student.api, 'setPortfolio', {
      projectId,
      title: `${publicTitle} — новая версия`,
      summary: 'Измененный публичный текст требует повторного согласия заказчика.',
      role: 'Аналитик таблиц',
      skills: ['Excel'],
      publicLinks: [],
      visibility: 'redacted_public',
    });
    expect(await (await guest.get(`/talent/${student.id}`)).text()).not.toContain(publicTitle);
    await denied(
      client.api,
      'consentPortfolio',
      { projectId, expectedUpdatedAt: currentPortfolio.updatedAt },
      409,
    );
  });

  test('оспаривание оплаты действительно создает обращение и уведомление другой стороне', async () => {
    const before = await view<{ notifications: { id: string; text: string }[] }>(
      client.api,
      'dashboard',
    );
    await mutate(student.api, 'acknowledgePayment', { projectId, status: 'disputed' });
    const work = await view<Work>(student.api, 'work', { id: projectId });
    expect(work.project.status).toBe('completed');
    expect(work.payment?.status).toBe('disputed');
    const queue = await view<{
      reports: {
        id: string;
        projectId: string;
        authorId: string;
        reason: string;
        status: string;
      }[];
    }>(admin.api, 'admin');
    const reports = queue.reports.filter(
      (report) => report.projectId === projectId && report.reason.includes('статус оплаты'),
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].authorId).toBe(student.id);
    expect(reports[0].status).toBe('open');
    const after = await view<{ notifications: { id: string; text: string }[] }>(
      client.api,
      'dashboard',
    );
    expect(
      after.notifications.some(
        (item) =>
          !before.notifications.some((old) => old.id === item.id) && item.text.includes('оспорен'),
      ),
    ).toBe(true);
    await denied(student.api, 'acknowledgePayment', { projectId, status: 'disputed' }, 409);
    await mutate(admin.api, 'resolveReport', {
      reportId: reports[0].id,
      resolution: 'ТЕСТ: обращение рассмотрено, финансовые утверждения не изменялись.',
    });
    expect((await view<Work>(student.api, 'work', { id: projectId })).payment?.status).toBe(
      'disputed',
    );
  });

  test('жалоба, модерация заказчика и блокировка действующей сессии', async () => {
    await mutate(student.api, 'fileComplaint', {
      projectId,
      reason: `ТЕСТ жалоба ${run}: проверить отображение платежных заявлений.`,
    });
    const queue = await view<{
      reports: { id: string; reason: string; status: string }[];
      users: { id: string; email?: string; accounts?: unknown; sessions?: unknown }[];
    }>(admin.api, 'admin');
    const report = queue.reports.find((item) => item.reason.includes(run))!;
    expect(report).toBeTruthy();
    expect(queue.users.every((user) => !user.accounts && !user.sessions)).toBe(true);
    await mutate(admin.api, 'resolveReport', {
      reportId: report.id,
      resolution: 'Учебная проверка выполнена: заявления участников обозначены отдельно.',
    });
    await mutate(admin.api, 'moderateClient', {
      userId: client.id,
      approve: true,
      reason: 'ТЕСТ: реквизиты учебного профиля проверены модератором.',
    });
    await mutate(admin.api, 'suspendUser', {
      userId: stranger.id,
      suspend: true,
      reason: 'ТЕСТ: временная блокировка для проверки отзыва доступа.',
    });
    expect((await stranger.api.get('/api/profile')).status()).toBe(401);
    expect(
      (
        await stranger.api.post('/api/auth/sign-in/email', {
          data: { email: stranger.email, password },
        })
      ).status(),
    ).toBe(403);
    await mutate(admin.api, 'suspendUser', {
      userId: stranger.id,
      suspend: false,
      reason: 'ТЕСТ завершен, ограничение снято администратором.',
    });
    await json(
      await stranger.api.post('/api/auth/sign-in/email', {
        data: { email: stranger.email, password },
      }),
    );
    expect((await student.api.get('/api/platform', { params: { view: 'admin' } })).status()).toBe(
      403,
    );
    const fakeSession = await newApi();
    await fakeSession.storageState();
    expect(
      (
        await fakeSession.get('/api/profile', {
          headers: { Cookie: 'better-auth.session_token=invalid-token' },
        })
      ).status(),
    ).toBe(401);
    await fakeSession.dispose();
  });

  test('мобильный UI390: отклик, назначение, два согласия, сдача, правки и приемка', async ({
    browser,
  }, testInfo) => {
    const created = await mutate<Project>(client.api, 'createProject', {
      ...projectInput,
      title: `E2E UI ${run}: мобильный заказ`,
      mode: 'remote',
    });
    const id = created.id;
    await mutate(client.api, 'submitForModeration', { projectId: id });
    await mutate(admin.api, 'moderateProject', {
      projectId: id,
      approve: true,
      reason: 'Учебный сценарий мобильной проверки.',
    });
    const studentPage = await pageFor(browser, student);
    const clientPage = await pageFor(browser, client);
    await studentPage.goto(`/projects/${id}`);
    await studentPage
      .getByLabel('Коротко о себе и подходе')
      .fill('Готов выполнить этот учебный заказ и проверить оба согласованных критерия.');
    await studentPage.getByRole('button', { name: 'Отправить отклик бесплатно' }).click();
    await expect(studentPage.getByRole('status')).toContainText('Отклик отправлен');
    await assertNoHorizontalOverflow(studentPage);
    await studentPage.screenshot({
      path: testInfo.outputPath('mobile-application.png'),
      fullPage: true,
    });
    await clientPage.goto(`/client/projects/${id}/applications`);
    await clientPage.getByRole('button', { name: 'Выбрать исполнителя', exact: true }).click();
    await clientPage.getByRole('button', { name: 'Подтвердить выбор', exact: true }).click();
    await clientPage.getByRole('link', { name: 'Перейти к согласованию' }).click();
    await clientPage.getByRole('button', { name: 'Подтвердить условия версии 1' }).click();
    await expect(clientPage.getByRole('status')).toContainText('подтвердила условия');
    await studentPage.goto(`/work/${id}`);
    await expect(
      studentPage.getByRole('button', { name: 'Сдать результат', exact: true }),
    ).toHaveCount(0);
    await studentPage.getByRole('button', { name: 'Подтвердить условия версии 1' }).click();
    await studentPage
      .getByLabel('Ссылки на результат')
      .fill(`https://example.com/ui-result/${run}`);
    await studentPage
      .getByLabel('Комментарий к сдаче')
      .fill('Первая мобильная сдача: таблица и пояснение контрольных сумм.');
    await assertNoHorizontalOverflow(studentPage);
    await studentPage.screenshot({
      path: testInfo.outputPath('mobile-submission.png'),
      fullPage: true,
    });
    await studentPage.getByRole('button', { name: 'Сдать результат', exact: true }).click();
    await expect(studentPage.getByRole('status')).toContainText('передан заказчику');
    await clientPage.reload();
    await clientPage.getByText('Запросить конкретные правки', { exact: true }).click();
    await clientPage.getByLabel(projectInput.acceptanceCriteria[0], { exact: true }).check();
    await clientPage
      .getByLabel('Что именно исправить?')
      .fill('По первому критерию добавьте контрольную строку общей суммы.');
    await clientPage.getByRole('button', { name: 'Отправить замечания' }).click();
    await expect(clientPage.getByRole('status')).toContainText('Список правок передан');
    await studentPage.reload();
    await studentPage
      .getByLabel('Ссылки на результат')
      .fill(`https://example.com/ui-result-v2/${run}`);
    await studentPage
      .getByLabel('Комментарий к сдаче')
      .fill('Вторая мобильная сдача: контрольная сумма добавлена, замечание исправлено.');
    await studentPage.getByRole('button', { name: 'Сдать результат', exact: true }).click();
    await expect(studentPage.getByRole('status')).toContainText('передан заказчику');
    await clientPage.reload();
    await clientPage.getByRole('button', { name: 'Принять результат', exact: true }).click();
    await expect(clientPage.getByRole('status')).toContainText('Результат принят');
    await expect(clientPage.getByRole('heading', { name: 'Подтверждённый опыт' })).toBeVisible();
    await assertNoHorizontalOverflow(clientPage);
    await clientPage.screenshot({
      path: testInfo.outputPath('mobile-acceptance.png'),
      fullPage: true,
    });
    await studentPage.context().close();
    await clientPage.context().close();
  });

  test('мобильные рабочие страницы, desktop/tablet каталог и честный Oxford ДЕМО', async ({
    browser,
  }, testInfo) => {
    const page = await pageFor(browser, student);
    await page.goto(`/work/${projectId}`);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Оплата — отдельно', exact: true }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('mobile-work.png'), fullPage: true });
    await page.goto('/student/applications');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.goto('/student/profile');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/403(?:\?|$)/);
    await page.context().close();

    const publicPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await publicPage.goto('/projects');
    await expect(publicPage.getByRole('heading').first()).toBeVisible();
    await assertNoHorizontalOverflow(publicPage);
    await publicPage.screenshot({
      path: testInfo.outputPath('desktop-catalog.png'),
      fullPage: true,
    });
    await publicPage.setViewportSize({ width: 768, height: 1024 });
    await assertNoHorizontalOverflow(publicPage);
    await publicPage.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(publicPage);
    await publicPage.screenshot({
      path: testInfo.outputPath('mobile-catalog.png'),
      fullPage: true,
    });
    const catalog = await view<{ projects: { id: string; title: string; demo: boolean }[] }>(
      guest,
      'catalog',
    );
    const oxford = catalog.projects.find((project) => project.title.includes('CRM'));
    expect(oxford?.demo).toBe(true);
    if (oxford) {
      await denied(
        student.api,
        'applyToProject',
        {
          projectId: oxford.id,
          message: 'Публичный отклик на Oxford ДЕМО должен быть заблокирован.',
          links: [],
        },
        [403, 409],
      );
      await publicPage.goto(`/projects/${oxford.id}`);
      await expect(publicPage.getByText(/ДЕМО/).first()).toBeVisible();
      await assertNoHorizontalOverflow(publicPage);
      await publicPage.screenshot({
        path: testInfo.outputPath('mobile-oxford-demo.png'),
        fullPage: true,
      });
    }
    await publicPage.close();
  });

  test('реальная форма регистрации390 и понятная ошибка отсутствия сервера', async ({
    browser,
  }, testInfo) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('/auth/register');
    await page.getByLabel('Отображаемое имя').fill('ТЕСТ мобильный участник');
    await page.getByLabel('Email', { exact: true }).fill(`mobile-${run}@example.test`);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByLabel('Повторите пароль').fill(password);
    await page.getByLabel('Мне исполнилось 18 лет').check();
    await page.getByRole('checkbox').nth(1).check();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('mobile-registration.png'), fullPage: true });
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.context().clearCookies();
    await page.goto('/auth/login');
    await page.route('**/api/auth/sign-in/email', (route) => route.abort('failed'));
    await page.getByLabel('Email', { exact: true }).fill(`mobile-${run}@example.test`);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Нет связи с сервером' })).toBeVisible();
    await page.unroute('**/api/auth/sign-in/email');
    await page.route('**/api/auth/sign-in/email', () => {
      /* Keep the browser request pending to exercise the actual AbortSignal timeout. */
    });
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Сервер не ответил вовремя' }),
    ).toBeVisible({ timeout: 25_000 });
    await assertNoHorizontalOverflow(page);
    await page.close();
  });

  test('восстановление пароля использует одноразовую ссылку и отзывает прежние сессии', async () => {
    const reset = await stranger.api.post('/api/auth/request-password-reset', {
      data: { email: stranger.email, redirectTo: `${baseURL}/auth/reset-password` },
    });
    expect(reset.ok()).toBe(true);
    const mailDirectory = path.join(process.cwd(), '.local', 'mail');
    const files = await readdir(mailDirectory);
    let resetUrl = '';
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const mail = JSON.parse(await readFile(path.join(mailDirectory, file), 'utf8')) as {
        to?: string;
        text?: string;
      };
      if (mail.to === stranger.email)
        resetUrl = mail.text?.match(/https?:\/\/\S+/)?.[0] ?? resetUrl;
    }
    expect(resetUrl).toBeTruthy();
    const parsed = new URL(resetUrl);
    const token = parsed.searchParams.get('token') ?? parsed.pathname.split('/').at(-1);
    const nextPassword = `Reset-${randomBytes(20).toString('base64url')}`;
    expect(
      (
        await stranger.api.post('/api/auth/reset-password', {
          data: { token, newPassword: nextPassword },
        })
      ).ok(),
    ).toBe(true);
    expect((await stranger.api.get('/api/profile')).status()).toBe(401);
    const reuse = await stranger.api.post('/api/auth/reset-password', {
      data: { token, newPassword: password },
    });
    expect(reuse.ok()).toBe(false);
    expect(
      (
        await stranger.api.post('/api/auth/sign-in/email', {
          data: { email: stranger.email, password: nextPassword },
        })
      ).ok(),
    ).toBe(true);
  });

  test('истекшая сессия отвергается, PostgreSQL запрещает подмену аудита и результата', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    try {
      await db.session.updateMany({
        where: { userId: competitor.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      expect((await competitor.api.get('/api/profile')).status()).toBe(401);
      const originalEvent = await db.projectEvent.findFirstOrThrow({ where: { projectId } });
      await expect(
        db.projectEvent.update({ where: { id: originalEvent.id }, data: { action: 'tampered' } }),
      ).rejects.toThrow();
      expect(
        (await db.projectEvent.findUniqueOrThrow({ where: { id: originalEvent.id } })).action,
      ).toBe(originalEvent.action);
      const originalSubmission = await db.submission.findFirstOrThrow({ where: { projectId } });
      await expect(
        db.submission.update({
          where: { id: originalSubmission.id },
          data: { notes: 'Подмена истории сдачи' },
        }),
      ).rejects.toThrow();
      const originalReview = await db.review.findFirstOrThrow({ where: { projectId } });
      await expect(db.review.delete({ where: { id: originalReview.id } })).rejects.toThrow();
    } finally {
      await db.$disconnect();
    }
  });

  test('создание черновика через UI, модерация, приостановка и отмена объявления', async ({
    browser,
  }, testInfo) => {
    const clientPage = await pageFor(browser, client, 1440);
    const moderatorPage = await pageFor(browser, admin, 1440);
    const uiTitle = `E2E ${run}: заказ создан через настоящую форму`;
    await clientPage.goto('/client/projects/new');
    await clientPage.locator('[name="title"]').fill(uiTitle);
    await clientPage
      .getByRole('button', { name: 'Сводная таблица до 100 строк', exact: true })
      .click();
    await expect(clientPage.locator('[name="title"]')).toHaveValue(uiTitle);
    await expect(clientPage.locator('[name="category"]')).toHaveValue('spreadsheets');
    await expect(clientPage.locator('[name="budgetKzt"]')).toHaveValue('');
    await expect(clientPage.locator('[name="estimatedHours"]')).toHaveValue('4');
    await expect(clientPage.locator('textarea[name="description"]')).toHaveValue(/До 100 строк/);
    await clientPage.locator('[name="category"]').selectOption('spreadsheets');
    await clientPage.locator('[name="problem"]').fill(projectInput.problem);
    await clientPage.locator('textarea[name="description"]').fill(projectInput.description);
    await clientPage.locator('[name="deliverables"]').fill(projectInput.deliverables);
    await clientPage
      .locator('[name="acceptanceCriteria"]')
      .fill(projectInput.acceptanceCriteria.join('\n'));
    await clientPage.locator('[name="skills"]').fill('Excel, Аналитика');
    await clientPage.locator('[name="budgetKzt"]').fill('12000');
    await clientPage.locator('[name="estimatedHours"]').fill('4');
    await clientPage.locator('[name="dueAt"]').fill(projectInput.dueAt.slice(0, 10));
    await clientPage.locator('[name="contactPrivate"]').fill('ПРИВАТНЫЙ ТЕСТОВЫЙ КОНТАКТ');
    await clientPage.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
    await clientPage.waitForURL((url) => /^\/projects\/[^/]+$/.test(url.pathname));
    const id = new URL(clientPage.url()).pathname.split('/').at(-1)!;
    await expect(clientPage.getByRole('heading', { name: uiTitle, exact: true })).toBeVisible();
    await clientPage.getByRole('button', { name: 'Отправить на модерацию', exact: true }).click();
    await expect(clientPage.getByRole('status')).toContainText('отправлен на модерацию');
    await moderatorPage.goto('/admin/moderation');
    const entry = moderatorPage
      .locator('article')
      .filter({ has: moderatorPage.getByRole('link', { name: uiTitle, exact: true }) })
      .first();
    await expect(entry).toBeVisible();
    await entry.getByRole('button', { name: 'Одобрить', exact: true }).click();
    await expect(moderatorPage.getByRole('status')).toContainText('опубликован');
    await mutate(student.api, 'applyToProject', {
      projectId: id,
      message: 'ТЕСТ: отклик для проверки закрытия при отмене заказа.',
      links: [],
    });
    const pauseReason = `ТЕСТ: модератор просит уточнить условия ${run}`;
    await mutate(admin.api, 'pauseProject', { projectId: id, reason: pauseReason });
    const pausedDashboard = await view<{ notifications: { text: string; url: string }[] }>(
      client.api,
      'dashboard',
    );
    expect(
      pausedDashboard.notifications.some(
        (item) => item.text.includes(pauseReason) && item.url === `/projects/${id}`,
      ),
    ).toBe(true);
    await mutate(client.api, 'submitForModeration', { projectId: id });
    await mutate(admin.api, 'moderateProject', { projectId: id, approve: true });
    await clientPage.reload();
    let manage = clientPage.locator('details').filter({
      has: clientPage.getByText('Приостановить или отменить объявление', { exact: true }),
    });
    await manage.locator('summary').click();
    await manage.getByRole('combobox', { name: /^Действие/ }).selectOption('pauseProject');
    await manage
      .getByLabel('Причина', { exact: true })
      .fill('ТЕСТ: временно уточняем сроки размещения.');
    await manage
      .getByRole('button', { name: 'Подтвердить изменение статуса', exact: true })
      .click();
    await expect(clientPage.getByRole('status')).toContainText('Статус заказа обновлён');
    expect((await view<{ project: Project }>(client.api, 'project', { id })).project.status).toBe(
      'paused',
    );
    await expect(
      clientPage.getByRole('link', { name: 'Редактировать черновик', exact: true }),
    ).toBeVisible();
    manage = clientPage.locator('details').filter({
      has: clientPage.getByText('Приостановить или отменить объявление', { exact: true }),
    });
    if (!(await manage.locator('select').isVisible())) await manage.locator('summary').click();
    await manage.getByRole('combobox', { name: /^Действие/ }).selectOption('cancelProject');
    await manage
      .getByLabel('Причина', { exact: true })
      .fill('ТЕСТ: отмена учебного объявления без удаления истории.');
    await manage
      .getByRole('button', { name: 'Подтвердить изменение статуса', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await view<{ project: Project }>(client.api, 'project', { id })).project.status,
      )
      .toBe('cancelled');
    const studentDashboard = await view<{
      applications: { projectId: string; status: string }[];
      notifications: { text: string }[];
    }>(student.api, 'dashboard');
    expect(
      studentDashboard.applications.find((application) => application.projectId === id)?.status,
    ).toBe('not_selected');
    expect(
      studentDashboard.notifications.some((item) => item.text.includes('Заказ отменён автором')),
    ).toBe(true);
    await assertNoHorizontalOverflow(clientPage);
    await moderatorPage.screenshot({
      path: testInfo.outputPath('desktop-moderation.png'),
      fullPage: true,
    });
    await clientPage.context().close();
    await moderatorPage.context().close();
  });

  test('локальные страницы не требуют внешних ресурсов в браузере', async ({ browser }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
    const externalRequests: string[] = [];
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      externalRequests.push(url.origin);
      return route.abort();
    });
    try {
      const page = await context.newPage();
      for (const pathname of ['/', '/projects', '/auth/login', '/help']) {
        await page.goto(pathname);
        await expect(page.getByRole('heading').first()).toBeVisible();
        await expect(
          page.getByRole('link', { name: /^Qosyl\s*Студенческие проекты$/ }),
        ).toBeVisible();
        await expect(page).toHaveTitle(/Qosyl/);
        await assertNoHorizontalOverflow(page);
      }
      expect(externalRequests).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('перебор входа ограничивается реальным серверным rate-limit', async () => {
    let limited = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await guest.post('/api/auth/sign-in/email', {
        data: { email: `absent-${run}@example.test`, password },
      });
      if (response.status() === 429) {
        limited = true;
        break;
      }
      expect(response.status()).toBe(401);
    }
    expect(limited).toBe(true);
  });

  test('сводка пилота защищена и показывает границы измерения', async ({ browser }, testInfo) => {
    expect((await guest.get('/api/platform?view=pilotMetrics')).status()).toBe(401);
    expect((await student.api.get('/api/platform?view=pilotMetrics')).status()).toBe(403);
    const metrics = await view<ViewData<'pilotMetrics'>>(admin.api, 'pilotMetrics');
    expect(metrics.views).toBeGreaterThanOrEqual(0);
    expect(metrics.engagement.startedAt).not.toBeNull();
    expect(metrics.engagement.coverage).toBe('tracked_authenticated_students');
    expect(metrics.stages).toHaveLength(7);
    expect(metrics.stages[0].count).toBeGreaterThan(0);
    expect(
      metrics.stages.every(
        (stage) => stage.shareOfPublished === null || stage.shareOfPublished <= 1,
      ),
    ).toBe(true);
    expect(JSON.stringify(metrics)).not.toContain(client.email);
    const page = await pageFor(browser, admin, 390);
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Результаты пилота', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Путь реальных проектов' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Измеренные просмотры и отклики' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Журнал затрат пилота' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath('mobile-pilot-metrics.png'),
      fullPage: true,
    });
    await page.context().close();
  });
  test('Q10: видимая страница, уникальный просмотр, конверсия и журнал затрат', async ({
    browser,
  }, testInfo) => {
    const tracked = await mutate<Project>(client.api, 'createProject', {
      ...projectInput,
      title: `Q10 ${run}`,
    });
    await denied(student.api, 'recordProjectView', { projectId: tracked.id }, 404);
    await mutate(client.api, 'submitForModeration', { projectId: tracked.id });
    await mutate(admin.api, 'moderateProject', {
      projectId: tracked.id,
      approve: true,
      reason: 'Проверка измерения.',
    });
    const before = await view<ViewData<'pilotMetrics'>>(admin.api, 'pilotMetrics');
    await view(student.api, 'project', { id: tracked.id });
    await student.api.get(`/projects/${tracked.id}`);
    expect((await view<ViewData<'pilotMetrics'>>(admin.api, 'pilotMetrics')).views).toBe(
      before.views,
    );
    const visible = await pageFor(browser, student);
    const recorded = visible.waitForResponse(
      (response) =>
        response.url().endsWith('/api/platform') &&
        response.request().postDataJSON()?.action === 'recordProjectView',
    );
    await visible.goto(`/projects/${tracked.id}`);
    expect((await recorded).status()).toBe(200);
    await visible.context().close();
    await mutate(student.api, 'recordProjectView', {
      projectId: tracked.id,
      studentId: competitor.id,
    });
    await mutate(client.api, 'recordProjectView', { projectId: tracked.id });
    const viewed = await view<ViewData<'pilotMetrics'>>(admin.api, 'pilotMetrics');
    expect(viewed.views).toBe((before.views ?? 0) + 1);
    await mutate(student.api, 'applyToProject', {
      projectId: tracked.id,
      message: 'Готов выполнить задание для проверки конверсии.',
      links: [],
    });
    const converted = await view<ViewData<'pilotMetrics'>>(admin.api, 'pilotMetrics');
    expect(converted.engagement.appliedPairs).toBe(before.engagement.appliedPairs + 1);
    expect(
      converted.repeat30Days.repeatRate === null || converted.repeat30Days.matureClients > 0,
    ).toBe(true);
    await denied(guest, 'recordProjectView', { projectId: tracked.id }, 401);
    for (const api of [guest, student.api]) {
      expect((await api.get('/api/platform?view=pilotCosts')).status()).toBe(
        api === guest ? 401 : 403,
      );
    }
    const costBefore = await view<ViewData<'pilotCosts'>>(admin.api, 'pilotCosts');
    const costInput = {
      idempotencyKey: randomUUID(),
      projectId: tracked.id,
      kind: 'moderation',
      occurredAt: new Date().toISOString(),
      minutes: 30,
      amountKzt: 1000,
      description: `Q10 API ${run}`,
    };
    await denied(student.api, 'recordPilotCost', costInput, 403);
    await mutate(admin.api, 'recordPilotCost', costInput);
    await mutate(admin.api, 'recordPilotCost', costInput);
    await denied(admin.api, 'recordPilotCost', { ...costInput, amountKzt: 2000 }, 409);
    const costs = await view<ViewData<'pilotCosts'>>(admin.api, 'pilotCosts');
    expect(costs.totals.amountKzt).toBe(costBefore.totals.amountKzt + 1000);
    expect(costs.totals.minutes).toBe(costBefore.totals.minutes + 30);
    const entry = costs.entries.find((item) => item.idempotencyKey === costInput.idempotencyKey)!;
    expect(entry).toBeDefined();
    const voidInput = { costId: entry.id, reason: 'Тестовая запись отменена после проверки.' };
    await denied(student.api, 'voidPilotCost', voidInput, 403);
    await mutate(admin.api, 'voidPilotCost', voidInput);
    await mutate(admin.api, 'voidPilotCost', voidInput);
    const voided = await view<ViewData<'pilotCosts'>>(admin.api, 'pilotCosts');
    expect(voided.totals.amountKzt).toBe(costBefore.totals.amountKzt);
    expect(voided.entries.find((item) => item.id === entry.id)?.voidReason).toBe(voidInput.reason);
    const page = await pageFor(browser, admin, 390);
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Результаты пилота', exact: true }).click();
    const journal = page.getByRole('region', { name: 'Журнал затрат пилота' });
    const localTime = await page.evaluate(() => {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    });
    await journal.locator('[name="occurredAt"]').fill(localTime);
    await journal.locator('[name="minutes"]').fill('15');
    await journal.locator('[name="amountKzt"]').fill('0');
    await journal.locator('textarea[name="description"]').fill(`Q10 UI ${run}`);
    await journal.getByRole('button', { name: 'Сохранить расход', exact: true }).click();
    const uiEntry = journal.locator('article').filter({ hasText: `Q10 UI ${run}` });
    await expect(uiEntry).toBeVisible();
    await uiEntry.getByRole('button', { name: 'Отменить ошибочную запись' }).click();
    await uiEntry.getByLabel('Причина отмены').fill('Тест интерфейса завершён, запись отменена.');
    await uiEntry.getByRole('button', { name: 'Подтвердить отмену записи' }).click();
    await expect(uiEntry.getByText(/Тест интерфейса завершён/)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('mobile-q10-costs.png'), fullPage: true });
    await page.context().close();
  });

  test('закрытый сбор: доступ admin, ручная форма, повторы и новые редакции', async ({
    browser,
  }, testInfo) => {
    async function content() {
      const response = await admin.api.get('/api/admin/content');
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toContain('no-store');
      return parseDataResponse(contentIntakeDataSchema, await response.json()).data;
    }
    async function change(action: string, fields: Record<string, unknown>) {
      const response = await admin.api.post('/api/admin/content', { data: { action, ...fields } });
      expect(response.status()).toBe(200);
      return parseDataResponse(contentMutationDataSchema, await response.json()).data;
    }
    expect((await guest.get('/api/admin/content')).status()).toBe(401);
    expect((await student.api.get('/api/admin/content')).status()).toBe(403);
    expect(
      (
        await student.api.post('/api/admin/content', {
          data: { action: 'setModuleEnabled', enabled: true },
        })
      ).status(),
    ).toBe(403);
    expect((await admin.api.get('/api/admin/content?page=1.5')).status()).toBe(400);
    expect(
      (
        await admin.api.post('/api/admin/content', {
          headers: { Origin: 'https://foreign.example' },
          data: { action: 'setModuleEnabled', enabled: true },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.api.post('/api/admin/content', {
          headers: { 'Content-Type': 'application/json-invalid' },
          data: '{}',
        })
      ).status(),
    ).toBe(415);
    const before = await content();
    let sourceId: string | undefined;
    const page = await pageFor(browser, admin, 390);
    try {
      await change('setModuleEnabled', { enabled: false });
      expect(
        (
          await admin.api.post('/api/admin/content', { data: { action: 'addManualContent' } })
        ).status(),
      ).toBe(409);
      await page.goto('/admin');
      await page.getByRole('button', { name: 'Сбор возможностей', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Закрытый сбор возможностей' });
      await expect(
        panel.getByRole('heading', { name: 'Закрытый сбор возможностей' }),
      ).toBeVisible();
      const sourceForm = panel.getByRole('form', { name: 'Добавление источника' });
      const sourceName = `E2E manual ${run}`;
      await sourceForm.locator('[name="name"]').fill(sourceName);
      await sourceForm.locator('[name="allowedHost"]').fill('example.org');
      await sourceForm
        .locator('[name="rightsNote"]')
        .fill('Синтетические данные теста; только закрытая проверка.');
      await sourceForm.getByRole('button', { name: 'Добавить выключенный источник' }).click();
      const sourceCard = panel.locator('article').filter({ hasText: sourceName });
      await expect(sourceCard).toBeVisible();
      sourceId = (await content()).sources.find((source) => source.name === sourceName)!.id;
      await sourceCard.getByRole('button', { name: 'Включить источник', exact: true }).click();
      await panel.getByRole('button', { name: 'Включить сбор', exact: true }).click();
      const manualForm = panel.getByRole('form', { name: 'Ручной материал' });
      await manualForm.locator('[name="sourceId"]').selectOption(sourceId);
      const itemTitle = `Синтетическая возможность ${run}`;
      const itemUrl = `https://example.org/opportunity/${run}?utm_source=test`;
      await manualForm.locator('[name="url"]').fill(itemUrl);
      await manualForm.locator('[name="title"]').fill(itemTitle);
      await manualForm
        .locator('[name="summary"]')
        .fill('Тестовое краткое описание для закрытой очереди.');
      await manualForm.getByRole('button', { name: 'Сохранить в закрытую очередь' }).click();
      await expect(panel.locator('article').filter({ hasText: itemTitle })).toBeVisible();
      const opportunitySearch = panel.getByRole('form', {
        name: 'Поиск возможностей',
        exact: true,
      });
      await opportunitySearch.locator('[name="q"]').fill(itemTitle.toUpperCase());
      await opportunitySearch
        .getByRole('button', { name: 'Найти возможности', exact: true })
        .click();
      await expect(panel.locator('article').filter({ hasText: itemTitle })).toBeVisible();
      await opportunitySearch.locator('[name="category"]').selectOption('grant');
      await opportunitySearch
        .getByRole('button', { name: 'Найти возможности', exact: true })
        .click();
      await expect(panel.getByRole('heading', { name: 'Материалы: 0', exact: true })).toBeVisible();
      await opportunitySearch.locator('[name="category"]').selectOption('');
      await opportunitySearch.locator('[name="q"]').fill('');
      await opportunitySearch
        .getByRole('button', { name: 'Найти возможности', exact: true })
        .click();
      await expect(panel.locator('article').filter({ hasText: itemTitle })).toBeVisible();

      const input = {
        sourceId,
        url: itemUrl,
        title: itemTitle,
        summary: 'Тестовое краткое описание для закрытой очереди.',
        category: 'hackathon',
        geography: '',
        language: 'ru',
      };
      expect(await change('addManualContent', input)).toMatchObject({ kind: 'duplicate' });
      expect(
        await change('addManualContent', { ...input, title: `${itemTitle}: обновлено` }),
      ).toMatchObject({ kind: 'updated' });
      const after = await content();
      const items = after.items.filter((item) => item.sourceId === sourceId);
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe('pending_review');
      expect(items[0].revisions[0].number).toBe(2);
      expect(items[0].revisions[0].publishedAt).toBeNull();
      expect(items[0].canonicalUrl).not.toContain('utm_source');
      await panel.getByRole('button', { name: 'Обновить очередь', exact: true }).click();
      await expect(panel.getByText(`${itemTitle}: обновлено`, { exact: true })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath('mobile-content-intake.png'),
        fullPage: true,
      });
    } finally {
      if (sourceId) await change('setSourceEnabled', { sourceId, enabled: false });
      await change('setModuleEnabled', { enabled: before.settings.enabled });
      await page.context().close();
    }
  });

  test('редактор возможностей: публикация, история, повторная проверка и отзыв', async ({
    browser,
  }, testInfo) => {
    async function change(action: string, fields: Record<string, unknown>) {
      const response = await admin.api.post('/api/admin/content', { data: { action, ...fields } });
      expect(response.status()).toBe(200);
      return parseDataResponse(contentMutationDataSchema, await response.json()).data;
    }
    async function detail(id: string) {
      const response = await admin.api.get(`/api/admin/content/${id}`);
      expect(response.status()).toBe(200);
      return parseDataResponse(contentDetailDataSchema, await response.json()).data;
    }
    async function publicPosts() {
      const response = await guest.get('/api/content/posts');
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toContain('no-store');
      return parseDataResponse(publicContentDataSchema, await response.json()).data.posts;
    }
    const settingsResponse = await admin.api.get('/api/admin/content');
    const before = parseDataResponse(contentIntakeDataSchema, await settingsResponse.json()).data;
    const source = await change('createSource', {
      name: `Редакционные примеры ${run}`,
      type: 'manual',
      allowedHost: 'example.org',
      rightsNote: 'Синтетические материалы для проверки интерфейса; публикация только в E2E.',
      enabled: true,
    });
    expect('sourceId' in source).toBe(true);
    if (!('sourceId' in source)) throw new Error('Source ID required.');
    const page = await pageFor(browser, admin, 390);
    const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const home = await publicContext.newPage();
    const itemTitle = `Возможность для редакционной проверки ${run}`;
    let itemId = '';
    try {
      await change('setModuleEnabled', { enabled: true });
      const added = await change('addManualContent', {
        sourceId: source.sourceId,
        url: `https://example.org/editorial/${run}`,
        title: itemTitle,
        summary: 'Короткий проверяемый анонс студенческого события.',
        category: 'event',
        language: 'ru',
      });
      expect('itemId' in added).toBe(true);
      if (!('itemId' in added)) throw new Error('Item ID required.');
      itemId = added.itemId;
      expect((await publicPosts()).some((post) => post.id === itemId)).toBe(false);
      expect((await guest.get(`/api/admin/content/${itemId}`)).status()).toBe(401);
      expect((await student.api.get(`/api/admin/content/${itemId}`)).status()).toBe(403);
      expect((await admin.api.get('/api/admin/content?status=invalid')).status()).toBe(400);
      for (const limit of ['0', '7', '1.5'])
        expect((await guest.get(`/api/content/posts?limit=${limit}`)).status()).toBe(400);
      await page.goto('/admin');
      await page.getByRole('button', { name: 'Сбор возможностей', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Закрытый сбор возможностей' });
      const queueCard = panel.locator('article').filter({ hasText: itemTitle });
      await queueCard.getByRole('button', { name: 'Проверить и открыть историю' }).click();
      const editor = panel.getByRole('region', { name: 'Редакционная проверка' });
      const review = editor.getByRole('form', { name: 'Решение по материалу' });
      await review
        .locator('[name="reason"]')
        .fill('Оригинал и условия проверены; синтетический материал E2E.');
      await review.getByRole('button', { name: 'Сохранить решение', exact: true }).click();
      await expect(
        editor.getByText('Сохранено. Решение записано в журнал.', { exact: true }),
      ).toBeVisible();
      expect((await publicPosts()).find((post) => post.id === itemId)?.title).toBe(itemTitle);
      await home.goto('/opportunities');
      const publicSearch = home.getByRole('form', { name: 'Поиск возможностей', exact: true });
      await publicSearch.locator('[name="q"]').fill(itemTitle.toUpperCase());
      await publicSearch.getByRole('button', { name: 'Найти возможности', exact: true }).click();
      await expect(home.getByRole('heading', { name: itemTitle, exact: true })).toBeVisible();
      await publicSearch.locator('[name="category"]').selectOption('grant');
      await publicSearch.getByRole('button', { name: 'Найти возможности', exact: true }).click();
      await expect(home.getByRole('heading', { name: itemTitle, exact: true })).not.toBeVisible();
      await assertNoHorizontalOverflow(home);
      await home.goto('/');
      const cards = home.getByRole('region', { name: 'Возможности и события' });
      await expect(cards.getByRole('heading', { name: itemTitle, exact: true })).toBeVisible();
      await expect(cards.getByText('Срок подачи уточняйте у организатора.')).toBeVisible();
      await expect(cards.getByRole('link', { name: 'К организатору' })).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      );
      const cta = await home
        .locator('.home-hero')
        .getByRole('link', { name: 'Найти проект' })
        .boundingBox();
      const section = await cards.boundingBox();
      expect(section!.y).toBeGreaterThan(cta!.y);
      for (const width of [390, 768, 1440]) {
        await home.setViewportSize({ width, height: 1000 });
        await assertNoHorizontalOverflow(home);
        await home.screenshot({
          path: testInfo.outputPath(`opportunities-${width}.png`),
          fullPage: true,
        });
      }
      await editor.getByText('Исправить материал перед публикацией', { exact: true }).click();
      const edit = editor.getByRole('form', { name: 'Редактирование материала' });
      await edit.locator('[name="title"]').fill(`${itemTitle}: уточнено`);
      await edit
        .locator('[name="reason"]')
        .fill('Уточнено название по оригиналу; требуется повторная проверка.');
      await edit.getByRole('button', { name: 'Сохранить новую редакцию' }).click();
      await expect(editor.getByText(/редакция 2/, { exact: false }).first()).toBeVisible();
      expect((await publicPosts()).some((post) => post.id === itemId)).toBe(false);
      await editor.getByText(/История редакций \(2\)/).click();
      await expect(editor.getByText(`Редакция 1: ${itemTitle}`, { exact: true })).toBeVisible();
      await expect(
        editor.getByText(`Редакция 2: ${itemTitle}: уточнено`, { exact: true }),
      ).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await editor.screenshot({
        path: testInfo.outputPath('editorial-history-390.png'),
      });
      await review
        .locator('[name="reason"]')
        .fill('Изменённая редакция проверена повторно и одобрена.');
      await review.getByRole('button', { name: 'Сохранить решение', exact: true }).click();
      await expect
        .poll(async () => (await publicPosts()).find((post) => post.id === itemId)?.title)
        .toBe(`${itemTitle}: уточнено`);
      const published = await detail(itemId);
      expect(published.item.approvedRevisionId).toBe(published.history[0].id);
      await review.locator('[name="decision"]').selectOption('withdraw');
      await review
        .locator('[name="reason"]')
        .fill('Отзыв синтетической публикации после проверки интерфейса.');
      await review.getByRole('button', { name: 'Сохранить решение', exact: true }).click();
      await expect.poll(async () => (await detail(itemId)).item.status).toBe('withdrawn');
      expect((await publicPosts()).some((post) => post.id === itemId)).toBe(false);
      await home.reload();
      await expect(home.getByRole('region', { name: 'Возможности и события' })).toHaveCount(0);
      await home.route('**/api/content/posts*', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":"Unavailable","code":"SERVICE_UNAVAILABLE"}',
        }),
      );
      await home.reload();
      await expect(
        home.locator('.home-hero').getByRole('link', { name: 'Найти проект' }),
      ).toBeVisible();
      await expect(home.getByRole('region', { name: 'Возможности и события' })).toHaveCount(0);
    } finally {
      await change('setSourceEnabled', { sourceId: source.sourceId, enabled: false });
      await change('setModuleEnabled', { enabled: before.settings.enabled });
      await page.context().close();
      await publicContext.close();
    }
  });

  test('приватный лид: ручная проверка, согласие и черновик только своего заказчика', async ({
    browser,
  }, testInfo) => {
    async function registry() {
      const response = await admin.api.get('/api/admin/leads');
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toContain('no-store');
      return parseDataResponse(leadListDataSchema, await response.json()).data;
    }
    async function detail(id: string) {
      const response = await admin.api.get(`/api/admin/leads/${id}`);
      expect(response.status()).toBe(200);
      return parseDataResponse(leadDetailDataSchema, await response.json()).data;
    }
    expect((await guest.get('/api/admin/leads')).status()).toBe(401);
    expect((await client.api.get('/api/admin/leads')).status()).toBe(403);
    expect((await student.api.get('/api/leads')).status()).toBe(403);
    expect((await admin.api.get('/api/admin/leads?page=1.5')).status()).toBe(400);
    expect((await admin.api.get('/api/admin/leads?kind=invalid')).status()).toBe(400);
    expect(
      (
        await admin.api.post('/api/admin/leads', {
          headers: { Origin: 'https://foreign.example' },
          data: { action: 'createLead' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.api.post('/api/admin/leads', {
          headers: { 'Content-Type': 'application/json-invalid' },
          data: '{}',
        })
      ).status(),
    ).toBe(415);
    const adminPage = await pageFor(browser, admin, 390),
      ownerPage = await pageFor(browser, client, 390);
    const privateTitle = `Приватный бизнес-запрос ${run}`;
    const consentProof = `ПРИВАТНОЕ ОСНОВАНИЕ ${run}: заказчик согласовал передачу запроса вручную.`;
    let leadId = '';
    try {
      const before = (await view<{ projects: Project[] }>(client.api, 'dashboard')).projects.length;
      await adminPage.goto('/admin');
      await adminPage.getByRole('button', { name: 'Лиды и обсуждения', exact: true }).click();
      const panel = adminPage.getByRole('region', { name: 'Приватные лиды и обсуждения' }),
        create = panel.getByRole('form', { name: 'Новый приватный материал' });
      await create
        .locator('[name="sourceUrl"]')
        .fill(`https://example.org/lead/${run}?utm_source=test`);
      await create.locator('[name="sourceName"]').fill('Синтетический источник E2E');
      await create.locator('[name="title"]').fill(privateTitle);
      await create
        .locator('[name="summary"]')
        .fill('Синтетическая потребность бизнеса для закрытой проверки и ручной передачи.');
      await create.locator('[name="assignedToId"]').selectOption(admin.id);
      await create.getByRole('button', { name: 'Добавить в приватный реестр' }).click();
      await expect(panel.getByRole('region', { name: 'Карточка приватного лида' })).toBeVisible();
      leadId = (await registry()).leads.find((lead) => lead.title === privateTitle)!.id;
      const card = panel.getByRole('region', { name: 'Карточка приватного лида' }),
        action = card.getByRole('form', { name: 'Действие по лиду' });
      for (const step of ['verifyLead', 'recordContact', 'recordConsent']) {
        await action.locator('[name="action"]').selectOption(step);
        if (step === 'recordConsent') await action.locator('[name="clientId"]').fill(client.id);
        await action
          .locator('[name="reason"]')
          .fill(
            step === 'recordConsent'
              ? consentProof
              : 'Действие выполнено человеком; синтетический итог проверки E2E.',
          );
        await action.getByRole('button', { name: 'Записать действие' }).click();
        await expect(action.getByRole('button', { name: 'Записать действие' })).toBeEnabled();
        await expect(action.locator('[name="action"]')).toHaveValue('addLeadNote');
      }
      const consented = await detail(leadId);
      expect(consented.lead.status).toBe('consented');
      expect(consented.total).toBe(4);
      expect((await view<{ projects: Project[] }>(client.api, 'dashboard')).projects.length).toBe(
        before,
      );
      const ownResponse = await client.api.get('/api/leads');
      expect(ownResponse.status()).toBe(200);
      const own = parseDataResponse(leadHandoffsDataSchema, await ownResponse.json()).data;
      expect(own.leads.some((lead) => lead.id === leadId)).toBe(true);
      expect(JSON.stringify(own)).not.toContain(consentProof);
      const foreign = await stranger.api.get('/api/leads');
      const foreignData = parseDataResponse(leadHandoffsDataSchema, await foreign.json()).data;
      expect(foreignData.leads.some((lead) => lead.id === leadId)).toBe(false);
      expect(
        (
          await stranger.api.post('/api/leads', {
            data: {
              leadId,
              expectedVersion: consented.lead.version,
              confirmation: true,
              project: projectInput,
            },
          })
        ).status(),
      ).toBe(404);
      await assertNoHorizontalOverflow(adminPage);
      await card.screenshot({ path: testInfo.outputPath('lead-admin-390.png') });
      await ownerPage.goto('/client/projects');
      const handoffs = ownerPage.getByRole('region', { name: 'Переданные бизнес-запросы' });
      await handoffs
        .getByRole('link', { name: 'Проверить и создать черновик', exact: true })
        .click();
      await expect(ownerPage.locator('[name="title"]')).toHaveValue(privateTitle);
      await expect(ownerPage.locator('[name="budgetKzt"]')).toHaveValue('');
      await ownerPage.locator('[name="title"]').fill(`Заказ владельца из лида ${run}`);
      await ownerPage.locator('[name="category"]').selectOption('spreadsheets');
      await ownerPage.locator('[name="problem"]').fill(projectInput.problem);
      await ownerPage.locator('textarea[name="description"]').fill(projectInput.description);
      await ownerPage.locator('[name="deliverables"]').fill(projectInput.deliverables);
      await ownerPage
        .locator('[name="acceptanceCriteria"]')
        .fill(projectInput.acceptanceCriteria.join('\n'));
      await ownerPage.locator('[name="skills"]').fill('Excel');
      await ownerPage.locator('[name="budgetKzt"]').fill('12000');
      await ownerPage.locator('[name="estimatedHours"]').fill('4');
      await ownerPage.locator('[name="dueAt"]').fill(projectInput.dueAt.slice(0, 10));
      await ownerPage.locator('[name="contactPrivate"]').fill('Синтетический контакт владельца');
      await ownerPage.locator('[name="leadConfirmation"]').check();
      await assertNoHorizontalOverflow(ownerPage);
      await ownerPage.screenshot({
        path: testInfo.outputPath('lead-owner-draft-390.png'),
        fullPage: true,
      });
      const conversion = ownerPage.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === '/api/leads' && request.method() === 'POST',
      );
      await ownerPage.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
      const sent = (await conversion).postDataJSON() as Record<string, unknown>;
      await ownerPage.waitForURL((url) => /^\/projects\/[^/]+$/.test(url.pathname));
      const projectId = new URL(ownerPage.url()).pathname.split('/').at(-1)!;
      const draft = await view<{ project: Project & { clientId: string } }>(client.api, 'project', {
        id: projectId,
      });
      expect(draft.project.clientId).toBe(client.id);
      expect(draft.project.status).toBe('draft');
      const replay = await client.api.post('/api/leads', { data: sent });
      expect(replay.status()).toBe(200);
      expect(parseDataResponse(leadConversionDataSchema, await replay.json()).data.projectId).toBe(
        projectId,
      );
      const saved = await detail(leadId);
      expect(saved.lead.projectId).toBe(projectId);
      expect(saved.lead.status).toBe('converted');
      expect((await guest.get(`/api/platform?view=project&id=${projectId}`)).status()).toBe(404);
      await ownerPage.getByRole('button', { name: 'Отправить на модерацию', exact: true }).click();
      await expect(ownerPage.getByRole('status')).toContainText('отправлен на модерацию');
      await mutate(admin.api, 'moderateProject', { projectId, approve: true });
      expect(
        (await view<{ project: Project }>(guest, 'project', { id: projectId })).project.status,
      ).toBe('published');
      const latest = await detail(leadId);
      expect(
        (
          await admin.api.post('/api/admin/leads', {
            data: {
              action: 'closeLead',
              leadId,
              expectedVersion: latest.lead.version,
              decision: 'archived',
              reason: 'Не меняем уже созданный заказ через реестр лидов.',
            },
          })
        ).status(),
      ).toBe(409);
      const stale = await admin.api.post('/api/admin/leads', {
        data: {
          action: 'addLeadNote',
          leadId,
          expectedVersion: 1,
          reason: 'Старая версия не может записать новое решение.',
        },
      });
      expect(stale.status()).toBe(409);
      const discussion = await admin.api.post('/api/admin/leads', {
        data: {
          action: 'createLead',
          kind: 'discussion',
          sourceUrl: `https://example.org/discussion/${run}`,
          sourceName: 'Синтетическое обсуждение',
          title: `Тема для ручного изучения ${run}`,
          summary: 'Только тема обсуждения; не является бизнес-заказом или согласием.',
          assignedToId: admin.id,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      expect(discussion.status()).toBe(200);
      parseDataResponse(leadMutationDataSchema, await discussion.json());
    } finally {
      await adminPage.context().close();
      await ownerPage.context().close();
    }
  });

  test('Threads: закрытый поиск, заполнение формы и повтор без дубля', async ({
    browser,
  }, testInfo) => {
    expect((await guest.get('/api/admin/leads/threads')).status()).toBe(401);
    expect((await client.api.get('/api/admin/leads/threads')).status()).toBe(403);
    const status = await admin.api.get('/api/admin/leads/threads');
    expect(status.status()).toBe(200);
    expect(await status.json()).toEqual({ data: { enabled: false, configured: false } });
    expect(
      (await admin.api.post('/api/admin/leads/threads', { data: { query: 'таблица' } })).status(),
    ).toBe(503);
    expect(
      (await admin.api.post('/api/admin/leads/threads', { data: { query: 'x' } })).status(),
    ).toBe(400);
    expect(
      (
        await admin.api.post('/api/admin/leads/threads', {
          headers: { Origin: 'https://evil.example' },
          data: { query: 'таблица' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.api.post('/api/admin/leads/threads', {
          headers: { 'Content-Type': 'text/plain' },
          data: '{}',
        })
      ).status(),
    ).toBe(415);
    expect(
      (
        await admin.api.post('/api/admin/leads/threads', { data: { query: 'x'.repeat(3000) } })
      ).status(),
    ).toBe(413);
    const adminPage = await pageFor(browser, admin, 390);
    try {
      await adminPage.goto('/admin');
      await adminPage.getByRole('button', { name: 'Лиды и обсуждения', exact: true }).click();
      const search = adminPage.getByRole('region', { name: 'Поиск в Threads' });
      await expect(search.getByRole('button', { name: 'Найти публикации' })).toBeDisabled();
      // Browser-only provider projection fixture; server HTTP/DB behavior is covered separately.
      const candidate = {
        externalId: '123456789',
        sourceUrl: `https://www.threads.com/@fixture/post/P${run.replace(/-/g, '')}`,
        sourceName: 'Threads @fixture',
        title: `Синтетический Threads ${run}`,
        summary: 'Синтетическая потребность для проверки локальной формы, не реальный бизнес-лид.',
        publishedAt: '2026-10-25T12:00:00.000Z',
      };
      await adminPage.route('**/api/admin/leads/threads', (route) =>
        route.fulfill({
          json:
            route.request().method() === 'GET'
              ? { data: { enabled: true, configured: true } }
              : { data: { items: [candidate], discarded: 0, searchType: 'RECENT', limited: true } },
        }),
      );
      await adminPage.reload();
      await adminPage.getByRole('button', { name: 'Лиды и обсуждения', exact: true }).click();
      await expect(search.getByRole('button', { name: 'Найти публикации' })).toBeEnabled();
      await search.locator('[name="query"]').fill('таблица');
      await search.getByRole('button', { name: 'Найти публикации' }).click();
      const choose = search.getByRole('button', { name: 'Заполнить пустую форму кандидата' });
      await expect(choose).toBeVisible();
      const form = adminPage.getByRole('form', { name: 'Новый приватный материал' });
      await form.locator('[name="title"]').fill('Мой несохранённый заголовок');
      await choose.click();
      await expect(form.locator('[name="title"]')).toHaveValue('Мой несохранённый заголовок');
      await form.getByRole('button', { name: 'Очистить форму' }).click();
      await choose.click();
      await expect(form.locator('[name="sourceUrl"]')).toHaveValue(candidate.sourceUrl);
      await expect(form.locator('[name="summary"]')).toHaveValue(candidate.summary);
      const before = await (await admin.api.get('/api/admin/leads')).json();
      await form.locator('[name="assignedToId"]').selectOption(admin.id);
      await form.locator('[name="kind"]').selectOption('discussion');
      await assertNoHorizontalOverflow(adminPage);
      await search.screenshot({ path: testInfo.outputPath('threads-search-390.png') });
      await form.getByRole('button', { name: 'Добавить в приватный реестр' }).click();
      await expect(
        adminPage.getByText('Кандидат учтён. Повтор ссылки не создаёт новую запись.', {
          exact: true,
        }),
      ).toBeVisible();
      const after = await (await admin.api.get('/api/admin/leads')).json();
      expect(after.data.total).toBe(before.data.total + 1);
      const saved = after.data.leads.find(
        (lead: { sourceUrl: string }) => lead.sourceUrl === candidate.sourceUrl,
      );
      expect(saved.status).toBe('new');
      await choose.click();
      await form.locator('[name="assignedToId"]').selectOption(admin.id);
      await form.locator('[name="kind"]').selectOption('discussion');
      await form.getByRole('button', { name: 'Добавить в приватный реестр' }).click();
      await expect(form.getByRole('button', { name: 'Добавить в приватный реестр' })).toBeEnabled();
      const detail = await (await admin.api.get(`/api/admin/leads/${saved.id}`)).json();
      expect(detail.data.total).toBe(1);
      expect(detail.data.lead.version).toBe(1);
      expect((await (await admin.api.get('/api/admin/leads')).json()).data.total).toBe(
        after.data.total,
      );
    } finally {
      await adminPage.context().close();
    }
  });

  test('контракт покрывает все команды, разделы и собственный профиль', async () => {
    for (const actor of [student, client, admin]) {
      const response = await actor.api.get('/api/profile');
      expect(response.status()).toBe(200);
      const profile = parseDataResponse(profileDataSchema, await response.json()).data;
      expect(profile.id).toBe(actor.id);
      if (actor === student) expect(profile.externalWorks).toHaveLength(1);
    }
    await view(client.api, 'portfolio');
    const dashboard = await view<{ notifications: { id: string }[] }>(client.api, 'dashboard');
    const notification = dashboard.notifications[0];
    expect(notification).toBeDefined();
    await mutate(client.api, 'markNotification', { notificationId: notification.id });
    await denied(stranger.api, 'markNotification', { notificationId: notification.id }, 404);
    const draft = await mutate<Project>(client.api, 'createProject', {
      ...projectInput,
      title: `Contract ${run}`,
    });
    await mutate(client.api, 'cancelProject', {
      projectId: draft.id,
      reason: 'Тестовое объявление отменено после проверки контракта.',
    });
    await mutate(client.api, 'disputeProject', {
      projectId,
      reason: 'Тестовый спор после завершения основного сквозного сценария.',
    });
    await view(client.api, 'work', { id: projectId });
    await view(admin.api, 'admin');
    await view(admin.api, 'backgroundJobs');
    expect((await student.api.get('/api/platform?view=backgroundJobs')).status()).toBe(403);
    expect([...contractCommands].sort()).toEqual(Object.keys(commandDataSchemas).sort());
    expect([...contractViews].sort()).toEqual(Object.keys(viewDataSchemas).sort());
  });
});
