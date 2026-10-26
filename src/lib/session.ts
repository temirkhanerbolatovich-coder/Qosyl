import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { config } from '@/lib/config';

/** Always reread account status/roles; suspended accounts lose access immediately. */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      studentProfile: true,
      clientProfile: true,
      externalWorks: { orderBy: { createdAt: 'desc' } },
    },
  });
  return user?.status === 'active' && (!user.demo || config.demoEnabled) ? user : null;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(role?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login');
  if (role && !user.roles.includes(role)) redirect('/403');
  return user;
}
