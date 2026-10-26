import 'server-only';
import type { User } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/permissions';
import { calculatePilotMetrics } from '@/lib/pilot-metrics';

export async function queryPilotMetrics(user: User) {
  requireRole(user.roles, 'admin');
  const [projects, settings] = await Promise.all([
    db.project.findMany({
      where: { demo: false, client: { demo: false } },
      select: {
        id: true,
        clientId: true,
        assignedStudentId: true,
        status: true,
        demo: true,
        client: { select: { demo: true } },
        assignedStudent: { select: { demo: true } },
        events: {
          where: {
            action: {
              in: [
                'moderateProject',
                'applyToProject',
                'selectApplicant',
                'work_started',
                'submitDeliverable',
                'acceptSubmission',
              ],
            },
          },
          select: { action: true, actorId: true, metadataJson: true, createdAt: true },
        },
        applications: {
          select: { studentId: true, createdAt: true, student: { select: { demo: true } } },
        },
        views: {
          select: { studentId: true, firstViewedAt: true, student: { select: { demo: true } } },
        },
        payment: { select: { status: true, clientPaidAt: true, studentReceivedAt: true } },
      },
    }),
    db.pilotAnalyticsSettings.findUnique({ where: { id: 'pilot' } }),
  ]);
  return calculatePilotMetrics(projects, {
    now: new Date(),
    viewsStartedAt: settings?.viewsStartedAt ?? null,
  });
}
