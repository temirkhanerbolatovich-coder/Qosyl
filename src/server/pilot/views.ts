import 'server-only';
import type { User } from '@prisma/client';
import { assert, requireRole } from '@/lib/permissions';
import { mutationSchemas } from '@/lib/validation';
import type { Tx } from '@/server/marketplace/shared';

/** One first-view row per real student/project; replaying a request never increments a counter. */
export async function recordProjectView(tx: Tx, raw: Record<string, unknown>, user: User) {
  requireRole(user.roles, 'student');
  const { projectId } = mutationSchemas.recordProjectView.parse(raw);
  if (user.demo || user.roles.includes('admin')) return { ok: true };
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      clientId: true,
      status: true,
      dueAt: true,
      demo: true,
      client: { select: { demo: true, status: true } },
    },
  });
  assert(
    project &&
      project.status === 'published' &&
      project.dueAt > new Date() &&
      project.client.status === 'active',
    404,
    'Заказ не найден или недоступен для просмотра.',
  );
  if (project.demo || project.client.demo || project.clientId === user.id) return { ok: true };
  await tx.projectView.createMany({
    data: [{ projectId, studentId: user.id }],
    skipDuplicates: true,
  });
  return { ok: true };
}
