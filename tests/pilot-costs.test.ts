import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma, User } from '@prisma/client';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  project: vi.fn(),
  audit: vi.fn(),
  list: vi.fn(),
  aggregate: vi.fn(),
  count: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { $transaction: mocks.transaction } }));
import { queryPilotCosts, recordPilotCost, voidPilotCost } from '../src/server/pilot/costs';
import { recordPilotCostInput } from '../src/lib/pilot-cost-validation';
import { pilotCostsDataSchema } from '../src/contracts/pilot-costs';

const admin = { id: 'admin', roles: ['admin'] } as User;
const student = { id: 'student', roles: ['student'] } as User;
const input = {
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  kind: 'moderation',
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
  minutes: 15,
  amountKzt: 500,
  description: 'Проверка тестового брифа',
};
const entry = () => ({
  ...input,
  id: 'cost',
  recordedById: admin.id,
  projectId: null,
  occurredAt: new Date(input.occurredAt),
  createdAt: new Date(),
  voidedAt: null,
  voidedById: null,
  voidReason: null,
});
const tx = {
  pilotCostEntry: {
    findUnique: mocks.find,
    create: mocks.create,
    update: mocks.update,
    findMany: mocks.list,
    aggregate: mocks.aggregate,
    count: mocks.count,
  },
  project: { findUnique: mocks.project },
  moderationAction: { create: mocks.audit },
} as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(null);
  mocks.create.mockResolvedValue(entry());
  mocks.project.mockResolvedValue({ demo: false, client: { demo: false }, assignedStudent: null });
  mocks.transaction.mockImplementation((callback) => callback(tx));
});

describe('pilot cost journal permissions and idempotency', () => {
  it('requires admin before touching journal data', async () => {
    await expect(recordPilotCost(tx, input, student)).rejects.toMatchObject({ status: 403 });
    await expect(
      voidPilotCost(tx, { costId: 'cost', reason: 'Ошибочный расход' }, student),
    ).rejects.toMatchObject({ status: 403 });
    await expect(queryPilotCosts(new URLSearchParams(), student)).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('creates one append-only entry and audit without copying input into the audit reason', async () => {
    await expect(
      recordPilotCost(tx, { ...input, action: 'recordPilotCost' }, admin),
    ).resolves.toEqual({ ok: true });
    expect(mocks.create).toHaveBeenCalledWith({
      data: { ...input, occurredAt: new Date(input.occurredAt), recordedById: admin.id },
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: {
        actorId: admin.id,
        targetId: 'cost',
        action: 'record_pilot_cost',
        reason: 'Добавлена запись затрат пилота.',
      },
    });
  });
  it('returns success for a retry with identical fields, including after cancellation', async () => {
    mocks.find.mockResolvedValue({
      ...entry(),
      voidedAt: new Date(),
      voidedById: admin.id,
      voidReason: 'Отменено оператором',
    });
    await expect(recordPilotCost(tx, input, admin)).resolves.toEqual({ ok: true });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('rejects reusing a key to change an existing expense', async () => {
    mocks.find.mockResolvedValue(entry());
    await expect(recordPilotCost(tx, { ...input, amountKzt: 600 }, admin)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([
    { demo: true, client: { demo: false }, assignedStudent: null },
    { demo: false, client: { demo: true }, assignedStudent: null },
    { demo: false, client: { demo: false }, assignedStudent: { demo: true } },
  ])('rejects costs attached to demo projects or participants', async (project) => {
    mocks.project.mockResolvedValue(project);
    await expect(
      recordPilotCost(tx, { ...input, projectId: 'project' }, admin),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('retains original fields when cancelling and makes a matching retry harmless', async () => {
    mocks.find.mockResolvedValue(entry());
    const reason = 'Расход ошибочно записан дважды.';
    await expect(voidPilotCost(tx, { costId: 'cost', reason }, admin)).resolves.toEqual({
      ok: true,
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'cost' },
      data: { voidedAt: expect.any(Date), voidedById: admin.id, voidReason: reason },
    });
    mocks.update.mockClear();
    mocks.audit.mockClear();
    mocks.find.mockResolvedValue({
      ...entry(),
      voidedAt: new Date(),
      voidedById: admin.id,
      voidReason: reason,
    });
    await expect(voidPilotCost(tx, { costId: 'cost', reason }, admin)).resolves.toEqual({
      ok: true,
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    await expect(
      voidPilotCost(tx, { costId: 'cost', reason: 'Другая причина исправления.' }, admin),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('checks existing linked projects and rejects invalid journal values', async () => {
    mocks.project.mockResolvedValue(null);
    await expect(
      recordPilotCost(tx, { ...input, projectId: 'missing' }, admin),
    ).rejects.toMatchObject({ status: 404 });
    for (const change of [
      { minutes: 0, amountKzt: 0 },
      { minutes: -1 },
      { amountKzt: 0.5 },
      { idempotencyKey: 'invalid' },
      { occurredAt: new Date(Date.now() + 86_400_000).toISOString() },
    ])
      expect(recordPilotCostInput.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it('keeps full-journal totals independent of pagination and serializes the exact wire contract', async () => {
    mocks.list.mockResolvedValue(
      Array.from({ length: 26 }, (_, index) => ({ ...entry(), id: `cost-${index}` })),
    );
    mocks.aggregate.mockResolvedValue({ _sum: { minutes: 1000, amountKzt: 12000 }, _count: 80 });
    mocks.count.mockResolvedValue(4);
    const result = await queryPilotCosts(new URLSearchParams('page=2'), admin);
    expect(result.entries).toHaveLength(25);
    expect(result).toMatchObject({
      page: 2,
      hasMore: true,
      totals: { minutes: 1000, amountKzt: 12000, entries: 80, voidedEntries: 4 },
    });
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 26 }));
    expect(mocks.aggregate).toHaveBeenCalledWith({
      where: { voidedAt: null },
      _sum: { minutes: true, amountKzt: true },
      _count: true,
    });
    expect(pilotCostsDataSchema.safeParse(JSON.parse(JSON.stringify(result))).success).toBe(true);
    expect(
      pilotCostsDataSchema.safeParse({
        ...JSON.parse(JSON.stringify(result)),
        privateNote: 'not allowed',
      }).success,
    ).toBe(false);
  });
});
