import type { ProjectStatus } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new AppError(status, message);
}
export function requireState(status: ProjectStatus, allowed: ProjectStatus[]) {
  assert(
    allowed.includes(status),
    409,
    'Действие недоступно на текущем этапе заказа. Обновите страницу.',
  );
}
export function requireRole(roles: string[], role: string) {
  assert(roles.includes(role), 403, 'Для этого действия нужна другая роль.');
}
export function isParticipant(
  project: { clientId: string; assignedStudentId: string | null },
  userId: string,
) {
  return project.clientId === userId || project.assignedStudentId === userId;
}
