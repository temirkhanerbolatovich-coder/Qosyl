import 'server-only';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { assert } from '@/lib/permissions';
import { rate } from '@/server/marketplace/shared';
import { caseCommand, caseOrder } from '@/lib/portfolio-case';

export async function readCases(userId: string) {
  return db.externalPortfolioItem.findMany({ where: { userId }, orderBy: caseOrder });
}
export async function changeCase(userId: string, command: z.infer<typeof caseCommand>) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
    const account = await tx.user.findUnique({ where: { id: userId } });
    assert(
      account?.status === 'active' && (!account.demo || config.demoEnabled),
      403,
      'Аккаунт недоступен.',
    );
    assert(account.roles.includes('student'), 403, 'Нужен профиль исполнителя.');
    assert(config.localMode || account.emailVerified, 403, 'Подтвердите email.');
    await rate(tx, `portfolio:${userId}`, 40, 60_000);
    const items = await tx.externalPortfolioItem.findMany({
      where: { userId },
      orderBy: caseOrder,
    });
    if (command.action === 'create') {
      assert(items.length < 30, 409, 'Допускается не более 30 самостоятельных кейсов.');
      await tx.externalPortfolioItem.create({
        data: {
          userId,
          ...command.data,
          revision: randomUUID(),
          position: Math.max(-1, ...items.map((i) => i.position)) + 1,
        },
      });
    } else if (command.action === 'reorder') {
      assert(
        command.items.length === items.length &&
          new Set(command.items.map((i) => i.id)).size === items.length &&
          command.items.every((i) =>
            items.some((current) => current.id === i.id && current.revision === i.revision),
          ),
        409,
        'Список изменился. Обновите портфолио.',
      );
      for (const [position, item] of command.items.entries()) {
        await tx.externalPortfolioItem.update({
          where: { id: item.id },
          data: { position, revision: randomUUID() },
        });
      }
    } else {
      const item = items.find((item) => item.id === command.id);
      assert(item, 404, 'Кейс не найден.');
      assert(item.revision === command.revision, 409, 'Кейс изменился. Обновите портфолио.');
      if (command.action === 'delete')
        await tx.externalPortfolioItem.delete({ where: { id: item.id } });
      else
        await tx.externalPortfolioItem.update({
          where: { id: item.id },
          data: { ...command.data, revision: randomUUID() },
        });
    }
    await tx.moderationAction.create({
      data: {
        actorId: userId,
        targetId: userId,
        action: `portfolio_case_${command.action}`,
        reason: 'Изменено самостоятельное портфолио; проектные согласия не изменялись.',
      },
    });
    return tx.externalPortfolioItem.findMany({ where: { userId }, orderBy: caseOrder });
  });
}
