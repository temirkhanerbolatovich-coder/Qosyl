import 'server-only';

import { Prisma, type User } from '@prisma/client';
import type { z } from 'zod';
import type { profileInput } from '@/app/api/profile/schema';
import { db } from '@/lib/db';
import { AppError } from '@/lib/permissions';
import type { CurrentUser } from '@/lib/session';

type ProfileUpdateInput = z.infer<typeof profileInput>;

/** Private self-profile projection; never returns authentication records or status metadata. */
export function getPrivateProfile(user: CurrentUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    demo: user.demo,
    studentProfile: user.studentProfile,
    clientProfile: user.clientProfile,
    externalWorks: user.externalWorks,
  };
}

/** Rechecks the account in the transaction; profile input cannot grant administrative roles. */
export async function updateProfile(user: Pick<User, 'id'>, data: ProfileUpdateInput) {
  await db.$transaction(
    async (tx) => {
      const account = await tx.user.findUnique({ where: { id: user.id } });
      if (!account || account.status !== 'active') {
        throw new AppError(403, 'Аккаунт недоступен.');
      }
      await tx.user.update({
        where: { id: user.id },
        data: { name: data.name, roles: [...new Set([...account.roles, data.role])] },
      });

      if (data.role === 'student') {
        const values = {
          bio: data.bio,
          city: data.city,
          institution: data.institution,
          discipline: data.discipline,
          weeklyHours: data.weeklyHours,
          skills: data.skills ? [...new Set(data.skills)] : undefined,
          formats: data.formats ? [...new Set(data.formats)] : undefined,
          isPublic: data.isPublic,
        };
        await tx.studentProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...values },
          update: values,
        });
        if (data.externalWorks) {
          await tx.externalPortfolioItem.deleteMany({ where: { userId: user.id } });
          if (data.externalWorks.length) {
            await tx.externalPortfolioItem.createMany({
              data: data.externalWorks.map((work) => ({ userId: user.id, ...work })),
            });
          }
        }
      } else {
        const values = {
          name: data.organisationName || data.name,
          industry: data.industry,
          city: data.city,
          contact: data.contact,
          description: data.description,
          // Verification belongs to the exact profile version reviewed by a moderator.
          verificationStatus: 'pending',
          verificationReason: null,
        };
        await tx.clientProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...values },
          update: values,
        });
      }
      await tx.moderationAction.create({
        data: {
          actorId: user.id,
          targetId: user.id,
          action: 'profile_updated',
          reason: `Обновлён профиль ${data.role}; публичные права администратора не изменялись.`,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
