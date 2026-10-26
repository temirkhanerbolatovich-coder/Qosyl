import 'server-only';
import type { User } from '@prisma/client';
import type { Action } from '@/lib/validation';
import { mutationSchemas } from '@/lib/validation';
import type { Tx } from '../shared';
import { assert, requireState } from '@/lib/permissions';
import { event, notify, loadProject, client, student, participant, snapshot } from '../shared';

export async function workCommands(
  tx: Tx,
  action: Action,
  raw: Record<string, unknown>,
  user: User,
) {
  switch (action) {
    case 'approveAgreement': {
      const { projectId, agreementId } = mutationSchemas.approveAgreement.parse(raw);
      const project = await loadProject(tx, projectId);
      participant(project, user);
      requireState(project.status, ['assigned']);
      const version = await tx.agreementVersion.findFirst({
        where: { projectId },
        orderBy: { number: 'desc' },
      });
      assert(
        version && version.id === agreementId,
        409,
        'Версия условий изменилась. Прочитайте новую версию перед подтверждением.',
      );
      const asClient = project.clientId === user.id;
      assert(
        !(asClient ? version.clientApprovedAt : version.studentApprovedAt),
        409,
        'Вы уже подтвердили эту версию.',
      );
      const updated = await tx.agreementVersion.update({
        where: { id: version.id },
        data: asClient ? { clientApprovedAt: new Date() } : { studentApprovedAt: new Date() },
      });
      if (updated.clientApprovedAt && updated.studentApprovedAt) {
        const terms = mutationSchemas.createProject.parse(updated.snapshotJson);
        await tx.project.update({
          where: { id: projectId },
          data: { ...terms, status: 'in_progress' },
        });
        if (version.number > 1)
          await tx.projectMilestone.createMany({
            data: terms.acceptanceCriteria.map((title) => ({
              projectId,
              title,
              agreementNumber: version.number,
            })),
          });
        await event(tx, projectId, user.id, 'work_started', { version: version.number });
        await notify(
          tx,
          asClient ? project.assignedStudentId! : project.clientId,
          'Условия согласованы. Можно приступать к работе.',
          projectId,
        );
      }
      await event(tx, projectId, user.id, action, { version: version.number });
      break;
    }
    case 'proposeAgreement': {
      const { projectId, ...terms } = mutationSchemas.proposeAgreement.parse(raw);
      const project = await loadProject(tx, projectId);
      participant(project, user);
      requireState(project.status, ['assigned', 'in_progress', 'changes_requested']);
      const latest = await tx.agreementVersion.findFirst({
        where: { projectId },
        orderBy: { number: 'desc' },
      });
      const proposedTerms =
        project.clientId === user.id
          ? terms
          : {
              ...terms,
              locationPrivate: project.locationPrivate,
              contactPrivate: project.contactPrivate,
            };
      await tx.agreementVersion.create({
        data: {
          projectId,
          number: (latest?.number ?? 0) + 1,
          snapshotJson: snapshot(proposedTerms),
        },
      });
      await tx.project.update({ where: { id: projectId }, data: { status: 'assigned' } });
      await event(tx, projectId, user.id, action, { version: (latest?.number ?? 0) + 1 });
      await notify(
        tx,
        project.clientId === user.id ? project.assignedStudentId! : project.clientId,
        'Предложена новая версия условий. Требуются два подтверждения.',
        projectId,
      );
      break;
    }
    case 'toggleMilestone': {
      const { projectId, milestoneId } = mutationSchemas.toggleMilestone.parse(raw);
      const project = await loadProject(tx, projectId);
      participant(project, user);
      requireState(project.status, ['in_progress', 'changes_requested']);
      const milestone = await tx.projectMilestone.findUnique({ where: { id: milestoneId } });
      assert(milestone && milestone.projectId === projectId, 404, 'Пункт не найден.');
      const latest = await tx.agreementVersion.findFirst({
        where: { projectId },
        orderBy: { number: 'desc' },
      });
      assert(
        latest?.number === milestone.agreementNumber,
        409,
        'Пункт относится к предыдущей версии условий.',
      );
      await tx.projectMilestone.update({
        where: { id: milestoneId },
        data: { done: !milestone.done },
      });
      await event(tx, projectId, user.id, action, { milestoneId, done: !milestone.done });
      break;
    }
    case 'submitDeliverable': {
      const { projectId, links, notes } = mutationSchemas.submitDeliverable.parse(raw);
      const project = await loadProject(tx, projectId);
      student(project, user);
      requireState(project.status, ['in_progress', 'changes_requested']);
      const submission = await tx.submission.create({
        data: { projectId, studentId: user.id, links, notes },
      });
      await tx.project.update({ where: { id: projectId }, data: { status: 'submitted' } });
      await event(tx, projectId, user.id, action, { submissionId: submission.id });
      await notify(tx, project.clientId, 'Результат сдан. Проверьте критерии приемки.', projectId);
      return submission;
    }
    case 'requestChanges':
    case 'acceptSubmission': {
      const input =
        action === 'requestChanges'
          ? mutationSchemas.requestChanges.parse(raw)
          : mutationSchemas.acceptSubmission.parse(raw);
      const project = await loadProject(tx, input.projectId);
      client(project, user);
      requireState(project.status, ['submitted']);
      const submission = await tx.submission.findFirst({
        where: { projectId: project.id },
        orderBy: { createdAt: 'desc' },
      });
      assert(submission?.id === input.submissionId, 409, 'Действие относится к последней сдаче.');
      if (action === 'requestChanges') {
        const change = mutationSchemas.requestChanges.parse(raw);
        assert(
          change.criteriaIndexes.every((index) => index < project.acceptanceCriteria.length),
          400,
          'Замечания должны относиться к согласованным критериям.',
        );
        await tx.revisionRequest.create({
          data: {
            submissionId: submission.id,
            notes: change.notes,
            criteriaIndexes: [...new Set(change.criteriaIndexes)],
          },
        });
        await tx.project.update({
          where: { id: project.id },
          data: { status: 'changes_requested' },
        });
        await notify(
          tx,
          project.assignedStudentId!,
          'Заказчик запросил исправления по критериям.',
          project.id,
        );
      } else {
        await tx.project.update({ where: { id: project.id }, data: { status: 'accepted' } });
        await tx.portfolioRecord.create({
          data: {
            projectId: project.id,
            studentId: project.assignedStudentId!,
            title: project.title,
            skills: project.skills,
            visibility: 'private',
          },
        });
        await notify(
          tx,
          project.assignedStudentId!,
          'Результат принят. Согласуйте портфолио и закрытие.',
          project.id,
        );
      }
      await event(tx, project.id, user.id, action, { submissionId: submission.id });
      break;
    }
    case 'acknowledgePayment': {
      const { projectId, status } = mutationSchemas.acknowledgePayment.parse(raw);
      const project = await loadProject(tx, projectId);
      participant(project, user);
      requireState(project.status, [
        'in_progress',
        'submitted',
        'changes_requested',
        'accepted',
        'completed',
        'disputed',
      ]);
      if (status === 'reported_paid_by_client') client(project, user);
      if (status === 'confirmed_received_by_student') student(project, user);
      const payment = await tx.paymentAcknowledgement.findUnique({ where: { projectId } });
      assert(
        payment && payment.status !== 'disputed',
        409,
        'По оплате открыт спор. Требуется ручное разрешение.',
      );
      if (status === 'confirmed_received_by_student')
        assert(payment.clientPaidAt, 409, 'Сначала заказчик должен отметить отправку оплаты.');
      const data =
        status === 'reported_paid_by_client'
          ? {
              status: payment.studentReceivedAt
                ? ('confirmed_received_by_student' as const)
                : status,
              clientPaidAt: payment.clientPaidAt ?? new Date(),
            }
          : status === 'confirmed_received_by_student'
            ? { status, studentReceivedAt: payment.studentReceivedAt ?? new Date() }
            : { status };
      await tx.paymentAcknowledgement.update({ where: { projectId }, data });
      if (status === 'disputed') {
        await tx.report.create({
          data: {
            projectId,
            authorId: user.id,
            targetUserId:
              project.clientId === user.id ? project.assignedStudentId : project.clientId,
            reason:
              'Участник оспорил статус оплаты по заказу. Требуется ручное рассмотрение и уточнение обстоятельств у обеих сторон.',
          },
        });
        await notify(
          tx,
          project.clientId === user.id ? project.assignedStudentId! : project.clientId,
          'Статус оплаты оспорен. Обращение поступило модератору; денежные операции платформа не выполняет.',
          projectId,
        );
      }
      await event(tx, projectId, user.id, action, { status });
      break;
    }
    case 'closeProject': {
      const { projectId } = mutationSchemas.closeProject.parse(raw);
      const project = await loadProject(tx, projectId);
      participant(project, user);
      requireState(project.status, ['accepted']);
      const asClient = project.clientId === user.id;
      assert(
        !(asClient ? project.clientClosedAt : project.studentClosedAt),
        409,
        'Вы уже отметили закрытие.',
      );
      const updated = await tx.project.update({
        where: { id: projectId },
        data: asClient ? { clientClosedAt: new Date() } : { studentClosedAt: new Date() },
      });
      if (updated.clientClosedAt && updated.studentClosedAt)
        await tx.project.update({ where: { id: projectId }, data: { status: 'completed' } });
      await event(tx, projectId, user.id, action);
      break;
    }
    case 'cancelProject':
    case 'disputeProject': {
      const { projectId, reason } =
        action === 'cancelProject'
          ? mutationSchemas.cancelProject.parse(raw)
          : mutationSchemas.disputeProject.parse(raw);
      const project = await loadProject(tx, projectId);
      if (project.assignedStudentId) participant(project, user);
      else client(project, user);
      if (action === 'cancelProject')
        requireState(project.status, [
          'draft',
          'pending_moderation',
          'published',
          'paused',
          'assigned',
        ]);
      else
        requireState(project.status, [
          'assigned',
          'in_progress',
          'submitted',
          'changes_requested',
          'accepted',
          'completed',
        ]);
      await tx.project.update({
        where: { id: projectId },
        data: {
          status: action === 'cancelProject' ? 'cancelled' : 'disputed',
          moderationReason: reason,
        },
      });
      if (action === 'cancelProject') {
        const remaining = await tx.application.findMany({
          where: { projectId, status: 'active' },
          select: { studentId: true },
        });
        await tx.application.updateMany({
          where: { projectId, status: 'active' },
          data: { status: 'not_selected' },
        });
        for (const application of remaining)
          await tx.notification.create({
            data: {
              userId: application.studentId,
              text: 'Заказ отменён автором. Ваш отклик закрыт.',
              url: '/student/applications',
            },
          });
        if (project.assignedStudentId)
          await notify(
            tx,
            project.clientId === user.id ? project.assignedStudentId : project.clientId,
            `Заказ отменён: ${reason}`,
            projectId,
          );
      }
      if (action === 'disputeProject')
        await tx.report.create({ data: { projectId, authorId: user.id, reason } });
      await event(tx, projectId, user.id, action, { reason });
      break;
    }
  }
  return { ok: true };
}
