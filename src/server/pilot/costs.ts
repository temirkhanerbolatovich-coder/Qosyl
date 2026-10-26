import 'server-only';
import { Prisma, type User } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { assert, requireRole } from '@/lib/permissions';
import { recordPilotCostInput, voidPilotCostInput } from '@/lib/pilot-cost-validation';

type Tx = Prisma.TransactionClient;

/** A retry with the same key cannot add a second expense or rewrite an existing one. */
export async function recordPilotCost(tx: Tx, raw: Record<string, unknown>, user: User) {
  requireRole(user.roles, 'admin');
  const input = recordPilotCostInput.parse(raw);
  const occurredAt = new Date(input.occurredAt);
  const existing = await tx.pilotCostEntry.findUnique({
    where: {
      recordedById_idempotencyKey: { recordedById: user.id, idempotencyKey: input.idempotencyKey },
    },
  });
  if (existing) {
    assert(
      existing.projectId === (input.projectId ?? null) &&
        existing.kind === input.kind &&
        existing.occurredAt.getTime() === occurredAt.getTime() &&
        existing.minutes === input.minutes &&
        existing.amountKzt === input.amountKzt &&
        existing.description === input.description,
      409,
      'Этот запрос уже сохранён с другими полями. Обновите журнал и проверьте запись.',
    );
    return { ok: true };
  }
  if (input.projectId) {
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: {
        demo: true,
        client: { select: { demo: true } },
        assignedStudent: { select: { demo: true } },
      },
    });
    assert(project, 404, 'Проект для расхода не найден.');
    assert(
      !project.demo && !project.client.demo && !project.assignedStudent?.demo,
      400,
      'Затраты пилота нельзя связывать с ДЕМО-проектом или ДЕМО-участником.',
    );
  }
  const entry = await tx.pilotCostEntry.create({
    data: { ...input, occurredAt, recordedById: user.id },
  });
  await tx.moderationAction.create({
    data: {
      actorId: user.id,
      targetId: entry.id,
      action: 'record_pilot_cost',
      reason: 'Добавлена запись затрат пилота.',
    },
  });
  return { ok: true };
}

/** Voiding retains original fields and records who cancelled the expense and why. */
export async function voidPilotCost(tx: Tx, raw: Record<string, unknown>, user: User) {
  requireRole(user.roles, 'admin');
  const { costId, reason } = voidPilotCostInput.parse(raw);
  const entry = await tx.pilotCostEntry.findUnique({ where: { id: costId } });
  assert(entry, 404, 'Запись затрат не найдена.');
  if (entry.voidedAt) {
    assert(
      entry.voidedById === user.id && entry.voidReason === reason,
      409,
      'Запись уже отменена. Обновите журнал.',
    );
    return { ok: true };
  }
  await tx.pilotCostEntry.update({
    where: { id: costId },
    data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason },
  });
  await tx.moderationAction.create({
    data: {
      actorId: user.id,
      targetId: costId,
      action: 'void_pilot_cost',
      reason: 'Отменена запись затрат пилота; причина сохранена в журнале.',
    },
  });
  return { ok: true };
}

export async function queryPilotCosts(params: URLSearchParams, user: User) {
  requireRole(user.roles, 'admin');
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .parse(params.get('page') || 1);
  // A consistent snapshot keeps the page and full-journal totals aligned during concurrent writes.
  return db.$transaction(
    async (tx) => {
      const [entries, active, voidedEntries] = await Promise.all([
        tx.pilotCostEntry.findMany({
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * 25,
          take: 26,
        }),
        tx.pilotCostEntry.aggregate({
          where: { voidedAt: null },
          _sum: { minutes: true, amountKzt: true },
          _count: true,
        }),
        tx.pilotCostEntry.count({ where: { voidedAt: { not: null } } }),
      ]);
      return {
        entries: entries.slice(0, 25),
        totals: {
          minutes: active._sum.minutes ?? 0,
          amountKzt: active._sum.amountKzt ?? 0,
          entries: active._count,
          voidedEntries,
        },
        page,
        hasMore: entries.length > 25,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
