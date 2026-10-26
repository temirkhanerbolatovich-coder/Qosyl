import { describe, expect, it } from 'vitest';
import { calculatePilotMetrics } from '../src/lib/pilot-metrics';
import {
  adminDataSchema,
  apiErrorSchema,
  catalogDataSchema,
  commandDataSchemas,
  dashboardDataSchema,
  eventSchema,
  ownerProjectDataSchema,
  profileDataSchema,
  publicProjectDataSchema,
  publicProjectSchema,
  viewDataSchemas,
  workDataSchema,
} from '../src/contracts/api-responses';

const timestamp = '2026-10-25T10:00:00.000Z';
const terms = {
  title: 'Обезличенная таблица',
  category: 'spreadsheets',
  problem: 'Нужна сводная таблица',
  description: 'Сгруппировать учебные строки',
  deliverables: 'Таблица и описание расчёта',
  acceptanceCriteria: ['Итоги сходятся'],
  skills: ['Excel'],
  difficulty: 'beginner_friendly',
  mode: 'remote',
  city: '',
  locationPrivate: 'Скрытый адрес',
  contactPrivate: 'Скрытый контакт',
  budgetKzt: 1000,
  estimatedHours: 2,
  dueAt: timestamp,
  preferredTime: '',
};
const project = {
  ...terms,
  id: 'project',
  clientId: 'client',
  assignedStudentId: null,
  status: 'published',
  demo: false,
  demoApplicationsAllowed: false,
  moderationReason: null,
  publishedAt: timestamp,
  expiresAt: timestamp,
  clientClosedAt: null,
  studentClosedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const publicClient = { id: 'client', name: 'Заказчик', demo: false, clientProfile: null };
const publicProject = {
  title: terms.title,
  category: terms.category,
  problem: terms.problem,
  description: terms.description,
  deliverables: terms.deliverables,
  acceptanceCriteria: terms.acceptanceCriteria,
  skills: terms.skills,
  difficulty: terms.difficulty,
  mode: terms.mode,
  city: terms.city,
  budgetKzt: terms.budgetKzt,
  estimatedHours: terms.estimatedHours,
  dueAt: terms.dueAt,
  preferredTime: terms.preferredTime,
  id: project.id,
  status: project.status,
  demo: project.demo,
  demoApplicationsAllowed: project.demoApplicationsAllowed,
  publishedAt: project.publishedAt,
  createdAt: project.createdAt,
  client: publicClient,
};
const viewer = { id: 'client', name: 'Заказчик', roles: ['client'] };
const application = {
  id: 'application',
  projectId: 'project',
  studentId: 'student',
  message: 'Готов выполнить задачу',
  links: [],
  status: 'active',
  createdAt: timestamp,
  updatedAt: timestamp,
};
const submission = {
  id: 'submission',
  projectId: 'project',
  studentId: 'student',
  links: ['https://example.test/result'],
  notes: 'Готовая таблица',
  createdAt: timestamp,
};
const publicProjectData = {
  project: {
    ...publicProject,
    clientId: 'client',
    assignedStudentId: null,
    client: { ...publicClient, status: 'active' },
  },
  application: null,
  canApply: false,
};
const ownerProjectData = {
  project: { ...project, client: publicClient },
  application: null,
  canApply: false,
};

describe('serialized response contracts and privacy boundaries', () => {
  it('distinguishes exact public and owner project shapes without optional private fields', () => {
    expect(publicProjectDataSchema.safeParse(publicProjectData).success).toBe(true);
    expect(ownerProjectDataSchema.safeParse(ownerProjectData).success).toBe(true);
    expect(publicProjectDataSchema.safeParse(ownerProjectData).success).toBe(false);
    expect(ownerProjectDataSchema.safeParse(publicProjectData).success).toBe(false);
    expect(viewDataSchemas.project.safeParse(publicProjectData).success).toBe(true);
    expect(viewDataSchemas.project.safeParse(ownerProjectData).success).toBe(true);
    expect(
      viewDataSchemas.project.safeParse({
        ...publicProjectData,
        project: { ...publicProjectData.project, contactPrivate: 'Unexpected contact' },
      }).success,
    ).toBe(false);
  });

  it.each(['locationPrivate', 'contactPrivate', 'email', 'password', 'token'])(
    'rejects %s in a catalog project',
    (field) => {
      expect(
        publicProjectSchema.safeParse({ ...publicProject, [field]: 'not-public' }).success,
      ).toBe(false);
    },
  );

  it('rejects unexpected nested authentication records instead of stripping them', () => {
    const response = { projects: [publicProject], total: 1, categories: ['spreadsheets'], page: 1 };
    expect(catalogDataSchema.safeParse(response).success).toBe(true);
    expect(
      catalogDataSchema.safeParse({
        ...response,
        projects: [
          { ...publicProject, client: { ...publicClient, accounts: [{ password: 'secret' }] } },
        ],
      }).success,
    ).toBe(false);
    expect(catalogDataSchema.safeParse({ ...response, page: 1.5 }).success).toBe(false);
  });

  it('preserves the complete own dashboard projection, including nullable payment and empty arrays', () => {
    const response = {
      user: viewer,
      currentUser: viewer,
      projects: [{ ...project, payment: null, _count: { applications: 0 } }],
      applications: [],
      notifications: [],
      portfolio: [],
    };
    expect(dashboardDataSchema.safeParse(response).success).toBe(true);
    expect(
      dashboardDataSchema.safeParse({
        ...response,
        projects: [{ ...response.projects[0], agreements: [] }],
      }).success,
    ).toBe(false);
  });

  it('describes work snapshots as known serialized terms, including redacted contacts', () => {
    const agreement = {
      id: 'agreement',
      projectId: 'project',
      number: 1,
      snapshotJson: { ...terms, locationPrivate: '', contactPrivate: '' },
      clientApprovedAt: null,
      studentApprovedAt: null,
      createdAt: timestamp,
    };
    const collections = {
      agreements: [agreement],
      milestones: [],
      submissions: [{ ...submission, revisions: [] }],
      events: [],
      payment: null,
      portfolio: null,
      reviews: [],
    };
    const response = {
      ...collections,
      currentUser: viewer,
      project: { ...project, client: publicClient, assignedStudent: null, ...collections },
    };
    expect(workDataSchema.safeParse(response).success).toBe(true);
    expect(
      workDataSchema.safeParse({ ...response, agreements: [{ ...agreement, snapshotJson: {} }] })
        .success,
    ).toBe(false);
    expect(workDataSchema.safeParse({ ...response, payment: {} }).success).toBe(false);
  });

  it('rejects private project fields and user credentials in administrative queues', () => {
    const response = {
      projects: [{ ...publicProject, moderationReason: null }],
      clients: [],
      reports: [],
      users: [],
      audit: [],
      stats: { completed: 0, paid: 0, firstPaidStudents: 0, pendingModeration: 1, openReports: 0 },
    };
    expect(adminDataSchema.safeParse(response).success).toBe(true);
    expect(
      adminDataSchema.safeParse({
        ...response,
        projects: [{ ...response.projects[0], contactPrivate: 'private' }],
      }).success,
    ).toBe(false);
    expect(
      adminDataSchema.safeParse({
        ...response,
        users: [
          {
            ...viewer,
            status: 'active',
            statusReason: null,
            demo: false,
            createdAt: timestamp,
            email: 'private@example.test',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('describes exactly the current private self-profile and refuses auth records', () => {
    const response = {
      ...viewer,
      email: 'self@example.test',
      demo: false,
      studentProfile: null,
      clientProfile: null,
      externalWorks: [],
    };
    expect(profileDataSchema.safeParse(response).success).toBe(true);
    expect(profileDataSchema.safeParse({ ...response, sessions: [] }).success).toBe(false);
    expect(profileDataSchema.safeParse({ ...response, emailVerified: true }).success).toBe(false);
  });

  it('uses the correct result for every command rather than a generic object', () => {
    const creates = new Set(['createProject', 'updateProject']);
    for (const [action, schema] of Object.entries(commandDataSchemas)) {
      const value = creates.has(action)
        ? project
        : action === 'applyToProject'
          ? application
          : action === 'submitDeliverable'
            ? submission
            : { ok: true };
      expect(schema.safeParse(value).success, action).toBe(true);
      expect(schema.safeParse({ arbitrary: true }).success, action).toBe(false);
    }
  });

  it('accepts null metric denominators and rejects fabricated views or invalid fractions', () => {
    const response = calculatePilotMetrics([], { now: new Date('2026-10-26T10:00:00Z') });
    expect(viewDataSchemas.pilotMetrics.safeParse(response).success).toBe(true);
    expect(viewDataSchemas.pilotMetrics.safeParse({ ...response, views: -1 }).success).toBe(false);
    expect(
      viewDataSchemas.pilotMetrics.safeParse({
        ...response,
        stages: [{ ...response.stages[0], shareOfPublished: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it('requires JSON wire dates, known event payloads and explicit error codes', () => {
    expect(
      publicProjectSchema.safeParse({ ...publicProject, createdAt: new Date(timestamp) }).success,
    ).toBe(false);
    expect(publicProjectSchema.safeParse({ ...publicProject, dueAt: 'not-a-date' }).success).toBe(
      false,
    );
    const event = {
      id: 'event',
      projectId: 'project',
      actorId: 'client',
      action: 'approveAgreement',
      metadataJson: { version: 1 },
      createdAt: timestamp,
      actor: { id: 'client', name: 'Заказчик' },
    };
    expect(eventSchema.safeParse(event).success).toBe(true);
    expect(eventSchema.safeParse({ ...event, metadataJson: { token: 'secret' } }).success).toBe(
      false,
    );
    expect(
      apiErrorSchema.safeParse({
        error: 'Проверьте поле',
        code: 'VALIDATION_ERROR',
        fields: { city: ['Нужен город'] },
      }).success,
    ).toBe(true);
    expect(apiErrorSchema.safeParse({ error: 'Failure', code: 'UNKNOWN' }).success).toBe(false);
  });
});
