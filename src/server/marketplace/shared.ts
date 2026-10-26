import 'server-only';
import { Prisma, type User, type Project } from '@prisma/client';
import { assert, isParticipant, requireRole } from '@/lib/permissions';
import type { ProjectInput } from '@/lib/validation';

export type Tx = Prisma.TransactionClient;
export async function event(
  tx: Tx,
  projectId: string,
  actorId: string,
  action: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await tx.projectEvent.create({ data: { projectId, actorId, action, metadataJson: metadata } });
}
export async function notify(tx: Tx, userId: string, text: string, projectId?: string) {
  await tx.notification.create({
    data: { userId, text, url: projectId ? `/work/${projectId}` : '/dashboard' },
  });
}
export async function moderation(
  tx: Tx,
  actorId: string,
  targetId: string,
  action: string,
  reason: string,
) {
  await tx.moderationAction.create({ data: { actorId, targetId, action, reason } });
}
export async function loadProject(tx: Tx, id: string) {
  const project = await tx.project.findUnique({ where: { id } });
  assert(project, 404, 'Заказ не найден.');
  return project;
}
export function client(project: Project, user: User) {
  requireRole(user.roles, 'client');
  assert(project.clientId === user.id, 403, 'Управлять заказом может только его автор.');
}
export function student(project: Project, user: User) {
  requireRole(user.roles, 'student');
  assert(project.assignedStudentId === user.id, 403, 'Действие доступно назначенному исполнителю.');
}
export function participant(project: Project, user: User) {
  assert(
    isParticipant(project, user.id),
    403,
    'Рабочая область доступна только участникам заказа.',
  );
}
export function snapshot(project: Project | ProjectInput) {
  return JSON.parse(
    JSON.stringify({
      title: project.title,
      category: project.category,
      problem: project.problem,
      description: project.description,
      deliverables: project.deliverables,
      acceptanceCriteria: project.acceptanceCriteria,
      skills: project.skills,
      difficulty: project.difficulty,
      mode: project.mode,
      city: project.city,
      locationPrivate: project.locationPrivate,
      contactPrivate: project.contactPrivate,
      budgetKzt: project.budgetKzt,
      estimatedHours: project.estimatedHours,
      dueAt: project.dueAt.toISOString(),
      preferredTime: project.preferredTime,
    }),
  ) as Prisma.InputJsonObject;
}
export async function rate(tx: Tx, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const value = await tx.rateLimit.findUnique({ where: { key } });
  if (!value || Number(value.lastRequest) + windowMs < now) {
    await tx.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, lastRequest: BigInt(now) },
      update: { count: 1, lastRequest: BigInt(now) },
    });
    return;
  }
  assert(value.count < limit, 429, 'Слишком много действий. Повторите позже.');
  await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
}
