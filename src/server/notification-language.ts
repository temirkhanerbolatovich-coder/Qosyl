import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { NotificationLanguage } from '@/lib/notification-language';
import { AppError } from '@/lib/permissions';

type Database = PrismaClient | Prisma.TransactionClient;

export async function getNotificationLanguage(
  db: Database,
  userId: string,
): Promise<NotificationLanguage> {
  const rows = await db.$queryRaw<
    { language: string }[]
  >`SELECT "language" FROM "NotificationPreference" WHERE "userId" = ${userId}`;
  return rows[0]?.language === 'kk' ? 'kk' : 'ru';
}

export async function setNotificationLanguage(
  db: Database,
  userId: string,
  language: NotificationLanguage,
) {
  const changed =
    await db.$executeRaw`INSERT INTO "NotificationPreference" ("userId", "language") SELECT "id", ${language} FROM "User" WHERE "id" = ${userId} AND "status" = 'active' ON CONFLICT ("userId") DO UPDATE SET "language" = EXCLUDED."language"`;
  if (!changed) throw new AppError(403, 'Аккаунт недоступен.');
}
