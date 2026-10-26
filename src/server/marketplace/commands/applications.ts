import 'server-only';
import type { User } from '@prisma/client';
import type { Action } from '@/lib/validation';
import { mutationSchemas } from '@/lib/validation';
import type { Tx } from '../shared';
import { config } from '@/lib/config';
import { assert, requireRole, requireState } from '@/lib/permissions';
import { event, notify, loadProject, client, snapshot, rate } from '../shared';

export async function applicationsCommands(
  tx: Tx,
  action: Action,
  raw: Record<string, unknown>,
  user: User,
) {
  switch (action) {
    case 'applyToProject': {
      requireRole(user.roles, 'student');
      const { projectId, message, links } = mutationSchemas.applyToProject.parse(raw);
      const project = await loadProject(tx, projectId);
      requireState(project.status, ['published']);
      assert(project.clientId !== user.id, 403, 'Нельзя откликаться на свой заказ.');
      assert(project.dueAt > new Date(), 409, 'Срок заказа истек.');
      assert(
        !project.demo || (config.demoEnabled && project.demoApplicationsAllowed),
        409,
        'Это закрытый демонстрационный пример. Отклики выключены.',
      );
      const owner = await tx.user.findUnique({
        where: { id: project.clientId },
        select: { status: true },
      });
      assert(owner?.status === 'active', 409, 'Заказчик приостановлен.');
      await rate(tx, `application:${user.id}`, 10, 3600000);
      const existing = await tx.application.findUnique({
        where: { projectId_studentId: { projectId, studentId: user.id } },
      });
      assert(
        !existing || existing.status === 'withdrawn',
        409,
        'Вы уже откликнулись на этот заказ.',
      );
      const result = existing
        ? await tx.application.update({
            where: { id: existing.id },
            data: { status: 'active', message, links },
          })
        : await tx.application.create({
            data: { projectId, studentId: user.id, message, links },
          });
      await event(tx, projectId, user.id, action);
      await tx.notification.create({
        data: {
          userId: project.clientId,
          text: 'Новый отклик на заказ.',
          url: `/client/projects/${projectId}/applications`,
        },
      });
      return result;
    }
    case 'updateApplication':
    case 'withdrawApplication': {
      const input =
        action === 'updateApplication'
          ? mutationSchemas.updateApplication.parse(raw)
          : mutationSchemas.withdrawApplication.parse(raw);
      const application = await tx.application.findUnique({
        where: { id: input.applicationId },
        include: { project: true },
      });
      assert(application && application.studentId === user.id, 403, 'Отклик недоступен.');
      requireState(application.project.status, ['published']);
      assert(application.status === 'active', 409, 'Отклик уже закрыт.');
      const changes =
        action === 'withdrawApplication'
          ? { status: 'withdrawn' as const }
          : (() => {
              const edit = mutationSchemas.updateApplication.parse(raw);
              return { message: edit.message, links: edit.links };
            })();
      await tx.application.update({ where: { id: application.id }, data: changes });
      await event(tx, application.projectId, user.id, action);
      break;
    }
    case 'selectApplicant': {
      const { projectId, applicationId } = mutationSchemas.selectApplicant.parse(raw);
      const project = await loadProject(tx, projectId);
      client(project, user);
      requireState(project.status, ['published']);
      assert(
        !project.assignedStudentId && project.dueAt > new Date(),
        409,
        'Выбор исполнителя уже закрыт.',
      );
      const application = await tx.application.findUnique({
        where: { id: applicationId },
        include: { student: { select: { status: true, roles: true } } },
      });
      assert(
        application &&
          application.projectId === projectId &&
          application.status === 'active' &&
          application.student.status === 'active' &&
          application.student.roles.includes('student'),
        409,
        'Отклик недоступен для выбора.',
      );
      await tx.project.update({
        where: { id: projectId },
        data: { status: 'assigned', assignedStudentId: application.studentId },
      });
      const rejected = await tx.application.findMany({
        where: { projectId, status: 'active', id: { not: applicationId } },
        select: { studentId: true },
      });
      await tx.application.updateMany({
        where: { projectId, status: 'active', id: { not: applicationId } },
        data: { status: 'not_selected' },
      });
      await tx.application.update({
        where: { id: applicationId },
        data: { status: 'selected' },
      });
      await tx.agreementVersion.create({
        data: { projectId, number: 1, snapshotJson: snapshot(project) },
      });
      await tx.projectMilestone.createMany({
        data: project.acceptanceCriteria.map((title) => ({ projectId, title })),
      });
      await tx.paymentAcknowledgement.create({ data: { projectId } });
      await event(tx, projectId, user.id, action, { applicationId });
      await notify(
        tx,
        application.studentId,
        'Вас выбрали. Подтвердите условия перед началом работы.',
        projectId,
      );
      for (const other of rejected)
        await tx.notification.create({
          data: {
            userId: other.studentId,
            text: 'По вашему отклику выбран другой исполнитель.',
            url: '/student/applications',
          },
        });
      break;
    }
  }
  return { ok: true };
}
