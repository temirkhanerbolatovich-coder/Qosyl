import 'server-only';
import type { User } from '@prisma/client';
import type { Action } from '@/lib/validation';
import { mutationSchemas } from '@/lib/validation';
import type { Tx } from '../shared';
import { assert, isParticipant, requireRole, requireState } from '@/lib/permissions';
import { event, notify, moderation, loadProject, rate } from '../shared';

export async function moderationCommands(
  tx: Tx,
  action: Action,
  raw: Record<string, unknown>,
  user: User,
) {
  switch (action) {
    case 'moderateProject': {
      requireRole(user.roles, 'admin');
      const { projectId, approve, reason } = mutationSchemas.moderateProject.parse(raw);
      const project = await loadProject(tx, projectId);
      requireState(project.status, ['pending_moderation']);
      assert(
        approve || reason.length >= 10,
        400,
        'При отклонении объясните причину (от 10 символов).',
      );
      if (approve) mutationSchemas.createProject.parse(project);
      await tx.project.update({
        where: { id: projectId },
        data: {
          status: approve ? 'published' : 'draft',
          moderationReason: reason || null,
          publishedAt: approve ? new Date() : null,
          expiresAt: project.dueAt,
        },
      });
      await moderation(
        tx,
        user.id,
        projectId,
        approve ? 'approve_project' : 'reject_project',
        reason,
      );
      await event(tx, projectId, user.id, action, { approve, reason });
      await tx.notification.create({
        data: {
          userId: project.clientId,
          text: approve ? 'Заказ одобрен и опубликован.' : `Заказ возвращен: ${reason}`,
          url: '/client/projects',
        },
      });
      break;
    }
    case 'fileComplaint': {
      const input = mutationSchemas.fileComplaint.parse(raw);
      if (input.projectId) {
        const project = await loadProject(tx, input.projectId);
        assert(
          project.status === 'published' || isParticipant(project, user.id),
          404,
          'Заказ недоступен.',
        );
      }
      if (input.targetUserId)
        assert(
          await tx.user.count({ where: { id: input.targetUserId } }),
          404,
          'Пользователь не найден.',
        );
      await rate(tx, `complaint:${user.id}`, 5, 3600000);
      await tx.report.create({ data: { ...input, authorId: user.id } });
      break;
    }
    case 'moderateClient': {
      requireRole(user.roles, 'admin');
      const { userId, approve, reason } = mutationSchemas.moderateClient.parse(raw);
      assert(approve || reason.length >= 10, 400, 'Объясните причину отказа.');
      const profile = await tx.clientProfile.findUnique({ where: { userId } });
      assert(profile, 404, 'Профиль не найден.');
      await tx.clientProfile.update({
        where: { userId },
        data: {
          verificationStatus: approve ? 'verified' : 'rejected',
          verificationReason: reason || null,
        },
      });
      await moderation(tx, user.id, userId, approve ? 'verify_client' : 'reject_client', reason);
      await notify(
        tx,
        userId,
        approve ? 'Профиль заказчика проверен модератором.' : `Профиль не подтвержден: ${reason}`,
      );
      break;
    }
    case 'suspendUser': {
      requireRole(user.roles, 'admin');
      const { userId, suspend, reason } = mutationSchemas.suspendUser.parse(raw);
      const target = await tx.user.findUnique({ where: { id: userId } });
      assert(target, 404, 'Пользователь не найден.');
      assert(
        target.id !== user.id && !target.roles.includes('admin'),
        403,
        'Административные аккаунты изменяются только серверным способом.',
      );
      await tx.user.update({
        where: { id: userId },
        data: {
          status: suspend ? 'suspended' : 'active',
          statusReason: suspend ? reason : null,
        },
      });
      if (suspend) await tx.session.deleteMany({ where: { userId } });
      await moderation(tx, user.id, userId, suspend ? 'suspend_user' : 'restore_user', reason);
      break;
    }
    case 'resolveReport': {
      requireRole(user.roles, 'admin');
      const { reportId, resolution } = mutationSchemas.resolveReport.parse(raw);
      const report = await tx.report.findUnique({ where: { id: reportId } });
      assert(report && report.status === 'open', 409, 'Жалоба уже рассмотрена или не найдена.');
      await tx.report.update({
        where: { id: reportId },
        data: { status: 'resolved', resolution, resolvedAt: new Date() },
      });
      await moderation(tx, user.id, reportId, 'resolve_report', resolution);
      await notify(tx, report.authorId, `Ответ по жалобе: ${resolution}`);
      break;
    }
  }
  return { ok: true };
}
