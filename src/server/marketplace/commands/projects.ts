import 'server-only';
import type { User } from '@prisma/client';
import type { Action } from '@/lib/validation';
import { mutationSchemas } from '@/lib/validation';
import type { Tx } from '../shared';
import { config } from '@/lib/config';
import { assert, requireRole, requireState } from '@/lib/permissions';
import { event, moderation, loadProject, client } from '../shared';

export async function projectsCommands(
  tx: Tx,
  action: Action,
  raw: Record<string, unknown>,
  user: User,
) {
  switch (action) {
    case 'createProject': {
      requireRole(user.roles, 'client');
      const input = mutationSchemas.createProject.parse(raw);
      const project = await tx.project.create({
        data: {
          ...input,
          clientId: user.id,
          demo: user.demo,
          demoApplicationsAllowed: user.demo && config.localMode,
        },
      });
      await event(tx, project.id, user.id, action);
      return project;
    }
    case 'updateProject': {
      const { projectId, ...input } = mutationSchemas.updateProject.parse(raw);
      const project = await loadProject(tx, projectId);
      client(project, user);
      requireState(project.status, ['draft', 'published', 'paused', 'pending_moderation']);
      assert(
        !project.assignedStudentId,
        409,
        'После выбора условия меняются только через новую версию соглашения.',
      );
      const result = await tx.project.update({
        where: { id: projectId },
        data: { ...input, status: 'draft', publishedAt: null, moderationReason: null },
      });
      await event(tx, projectId, user.id, action, { requiresRemoderation: true });
      return result;
    }
    case 'submitForModeration': {
      const { projectId } = mutationSchemas.submitForModeration.parse(raw);
      const project = await loadProject(tx, projectId);
      client(project, user);
      requireState(project.status, ['draft', 'paused']);
      mutationSchemas.createProject.parse(project);
      await tx.project.update({
        where: { id: projectId },
        data: { status: 'pending_moderation', moderationReason: null },
      });
      await event(tx, projectId, user.id, action);
      break;
    }
    case 'pauseProject': {
      const { projectId, reason } = mutationSchemas.pauseProject.parse(raw);
      const project = await loadProject(tx, projectId);
      if (!user.roles.includes('admin')) client(project, user);
      requireState(project.status, ['published', 'pending_moderation']);
      await tx.project.update({
        where: { id: projectId },
        data: { status: 'paused', moderationReason: reason },
      });
      await event(tx, projectId, user.id, action, { reason });
      if (user.roles.includes('admin')) {
        await moderation(tx, user.id, projectId, 'pause_project', reason);
        if (project.clientId !== user.id)
          await tx.notification.create({
            data: {
              userId: project.clientId,
              text: `Модератор приостановил заказ: ${reason}`,
              url: `/projects/${projectId}`,
            },
          });
      }
      break;
    }
  }
  return { ok: true };
}
