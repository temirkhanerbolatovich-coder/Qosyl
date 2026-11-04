import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { assert } from '@/lib/permissions';
import { rate } from '@/server/marketplace/shared';
import { MAX_STORED_AVATAR_BYTES } from '@/lib/avatar';

const metadata = { revision: true, isPublic: true } as const;
async function lockOwner(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId } });
  assert(
    user?.status === 'active' && (!user.demo || config.demoEnabled),
    403,
    'Аккаунт недоступен.',
  );
  assert(user.roles.includes('student'), 403, 'Аватар доступен в профиле исполнителя.');
  assert(config.localMode || user.emailVerified, 403, 'Сначала подтвердите email.');
}

/** Count attempts before reading/decoding, including rejected files. */
export async function beginAvatarMutation(userId: string) {
  await db.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    await rate(tx, `avatar:${userId}`, 10, 60_000);
  });
}

export async function readOwnAvatar(userId: string) {
  return db.profileAvatar.findUnique({ where: { userId }, select: metadata });
}

export async function writeAvatar(
  userId: string,
  change:
    | { bytes: Buffer }
    | { isPublic: boolean; revision: string }
    | { remove: true; revision: string },
) {
  return db.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    let result = null;
    if ('bytes' in change) {
      assert(
        change.bytes.length > 0 && change.bytes.length <= MAX_STORED_AVATAR_BYTES,
        413,
        'Изображение слишком большое.',
      );
      const values = {
        bytes: new Uint8Array(change.bytes),
        revision: randomUUID(),
        isPublic: false,
      };
      result = await tx.profileAvatar.upsert({
        where: { userId },
        create: { userId, ...values },
        update: values,
        select: metadata,
      });
    } else {
      const current = await tx.profileAvatar.findUnique({ where: { userId }, select: metadata });
      assert(
        current && current.revision === change.revision,
        409,
        'Аватар изменился. Обновите страницу перед действием.',
      );
      if ('remove' in change) await tx.profileAvatar.delete({ where: { userId } });
      else
        result = await tx.profileAvatar.update({
          where: { userId },
          data: { isPublic: change.isPublic, revision: randomUUID() },
          select: metadata,
        });
    }
    await tx.moderationAction.create({
      data: {
        actorId: userId,
        targetId: userId,
        action: 'avatar_updated',
        reason:
          'bytes' in change
            ? 'Загружен приватный аватар.'
            : 'remove' in change
              ? 'Аватар удалён.'
              : `Публикация аватара: ${change.isPublic}.`,
      },
    });
    return result;
  });
}

export async function readAvatar(userId: string, viewerId?: string) {
  // One SQL projection checks access and fetches bytes; no public object-store URLs.
  return db.profileAvatar.findFirst({
    where: {
      userId,
      user: { status: 'active', ...(config.demoEnabled ? {} : { demo: false }) },
      ...(viewerId === userId
        ? {}
        : {
            isPublic: true,
            user: {
              status: 'active',
              ...(config.demoEnabled ? {} : { demo: false }),
              studentProfile: { isPublic: true },
            },
          }),
    },
    select: { bytes: true },
  });
}
