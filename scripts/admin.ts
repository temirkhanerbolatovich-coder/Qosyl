import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes('--revoke');

async function main() {
  if (!email || !email.includes('@')) {
    throw new Error('Usage: npm run admin -- user@example.com [--revoke]');
  }
  const account = await db.user.findUnique({ where: { email } });
  if (!account) throw new Error('Аккаунт не найден. Сначала зарегистрируйте пользователя.');
  await db.$transaction(
    async (tx) => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: account.id } });
      const roles = revoke
        ? current.roles.filter((role) => role !== 'admin')
        : [...new Set([...current.roles, 'admin'])];
      if (revoke && current.roles.includes('admin')) {
        const other = await tx.user.count({
          where: { id: { not: current.id }, roles: { has: 'admin' }, status: 'active' },
        });
        if (!other) throw new Error('Нельзя отозвать права последнего активного администратора.');
      }
      await tx.user.update({ where: { id: current.id }, data: { roles } });
      await tx.moderationAction.create({
        data: {
          actorId: current.id,
          targetId: current.id,
          action: revoke ? 'admin_revoked_via_cli' : 'admin_granted_via_cli',
          reason: 'Серверная команда оператора, имеющего доступ к среде приложения.',
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  console.log(`Administrative role ${revoke ? 'revoked' : 'granted'}; audit recorded.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Administrative command failed.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
