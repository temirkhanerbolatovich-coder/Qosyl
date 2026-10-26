import 'server-only';
import type { User } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/permissions';
import { queryPilotMetrics } from '@/server/pilot/metrics';
import { publicProject } from '../projections';

export async function adminQueries(params: URLSearchParams, user: User) {
  const view = params.get('view') || 'catalog';
  if (view === 'pilotMetrics') return queryPilotMetrics(user);
  if (view === 'admin') {
    requireRole(user.roles, 'admin');
    const [projects, clients, reports, users, audit, completed, paid, firstPaid] =
      await Promise.all([
        db.project.findMany({
          where: { status: { in: ['pending_moderation', 'published', 'paused'] } },
          select: { ...publicProject, moderationReason: true },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        db.clientProfile.findMany({
          where: { verificationStatus: 'pending' },
          include: { user: { select: { id: true, name: true, demo: true } } },
          take: 100,
        }),
        db.report.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, name: true } },
            project: { select: { id: true, title: true } },
          },
          take: 100,
        }),
        db.user.findMany({
          select: {
            id: true,
            name: true,
            status: true,
            statusReason: true,
            roles: true,
            demo: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        db.moderationAction.findMany({
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        db.project.count({ where: { demo: false, status: 'completed' } }),
        db.project.count({
          where: {
            demo: false,
            status: 'completed',
            payment: {
              clientPaidAt: { not: null },
              studentReceivedAt: { not: null },
              status: 'confirmed_received_by_student',
            },
          },
        }),
        db.project.findMany({
          where: {
            demo: false,
            status: 'completed',
            payment: {
              clientPaidAt: { not: null },
              studentReceivedAt: { not: null },
              status: 'confirmed_received_by_student',
            },
          },
          select: { assignedStudentId: true },
          distinct: ['assignedStudentId'],
        }),
      ]);
    return {
      projects,
      clients,
      reports,
      users,
      audit,
      stats: {
        completed,
        paid,
        firstPaidStudents: firstPaid.length,
        pendingModeration: projects.filter((p) => p.status === 'pending_moderation').length,
        openReports: reports.filter((r) => r.status === 'open').length,
      },
    };
  }
  throw new Error('Unsupported query dispatch');
}
