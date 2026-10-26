import 'server-only';
import type { User } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/permissions';
import { getLifecycleSettings } from '@/lib/lifecycle-settings.mjs';

/** Read-only operational history; there is deliberately no HTTP endpoint that runs the worker. */
export async function queryBackgroundJobs(user: User) {
  requireRole(user.roles, 'admin');
  return {
    settings: getLifecycleSettings(),
    runs: await db.backgroundJobRun.findMany({
      where: { job: 'project-lifecycle' },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 20,
    }),
  };
}
