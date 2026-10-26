import 'server-only';
import type { User } from '@prisma/client';
import type { Action } from '@/lib/validation';
import { mutationSchemas } from '@/lib/validation';
import type { Tx } from '../shared';
import { assert, requireState } from '@/lib/permissions';
import { event, loadProject, participant } from '../shared';

export async function portfolioCommands(
  tx: Tx,
  action: Action,
  raw: Record<string, unknown>,
  user: User,
) {
  switch (action) {
    case 'setPortfolio': {
      const { projectId, ...input } = mutationSchemas.setPortfolio.parse(raw);
      const project = await loadProject(tx, projectId);
      participant(project, user);
      requireState(project.status, ['accepted', 'completed']);
      const record = await tx.portfolioRecord.findUnique({ where: { projectId } });
      assert(record, 404, 'Запись портфолио не найдена.');
      const asClient = project.clientId === user.id;
      await tx.portfolioRecord.update({
        where: { projectId },
        data: {
          ...input,
          clientConsentAt: asClient && input.visibility !== 'private' ? new Date() : null,
          studentConsentAt: !asClient && input.visibility !== 'private' ? new Date() : null,
        },
      });
      await event(tx, projectId, user.id, action, { visibility: input.visibility });
      break;
    }
    case 'consentPortfolio': {
      const { projectId, expectedUpdatedAt } = mutationSchemas.consentPortfolio.parse(raw);
      const project = await loadProject(tx, projectId);
      participant(project, user);
      requireState(project.status, ['accepted', 'completed']);
      const record = await tx.portfolioRecord.findUnique({ where: { projectId } });
      assert(
        record && record.visibility !== 'private' && record.summary.length >= 10,
        409,
        'Сначала подготовьте публичную обезличенную запись.',
      );
      assert(
        record.updatedAt.toISOString() === expectedUpdatedAt,
        409,
        'Запись портфолио изменилась. Проверьте содержание перед согласием.',
      );
      await tx.portfolioRecord.update({
        where: { projectId },
        data:
          project.clientId === user.id
            ? { clientConsentAt: new Date() }
            : { studentConsentAt: new Date() },
      });
      await event(tx, projectId, user.id, action);
      break;
    }
    case 'createReview': {
      const { projectId, rating, body } = mutationSchemas.createReview.parse(raw);
      const project = await loadProject(tx, projectId);
      participant(project, user);
      requireState(project.status, ['accepted', 'completed']);
      const recipientId =
        project.clientId === user.id ? project.assignedStudentId! : project.clientId;
      assert(recipientId !== user.id, 403, 'Нельзя оставить отзыв самому себе.');
      const existing = await tx.review.findUnique({
        where: { projectId_authorId: { projectId, authorId: user.id } },
      });
      assert(!existing, 409, 'Отзыв уже сохранен.');
      await tx.review.create({
        data: { projectId, authorId: user.id, recipientId, rating, body },
      });
      await event(tx, projectId, user.id, action);
      break;
    }
  }
  return { ok: true };
}
