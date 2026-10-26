import 'server-only';
import type { User } from '@prisma/client';
import type { Action } from '@/lib/validation';
import { mutationSchemas } from '@/lib/validation';
import type { Tx } from '../shared';
import { assert } from '@/lib/permissions';

export async function notificationsCommands(
  tx: Tx,
  action: Action,
  raw: Record<string, unknown>,
  user: User,
) {
  switch (action) {
    case 'markNotification': {
      const { notificationId } = mutationSchemas.markNotification.parse(raw);
      const notification = await tx.notification.findUnique({ where: { id: notificationId } });
      assert(notification?.userId === user.id, 404, 'Уведомление недоступно.');
      await tx.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });
      break;
    }
  }
  return { ok: true };
}
