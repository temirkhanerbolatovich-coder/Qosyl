import { publicCaseWhere, caseOrder } from '@/lib/portfolio-case';
import 'server-only';
import { visibleStudentProfile } from '@/lib/profile-visibility';
import { config } from '@/lib/config';
import { Prisma, type User } from '@prisma/client';
import { db } from '@/lib/db';
import { assert } from '@/lib/permissions';
import { loadProject, client, participant } from '../shared';
import { publicProject, publicUser } from '../projections';

export async function accountQueries(params: URLSearchParams, user: User) {
  const view = params.get('view') || 'catalog';
  if (view === 'dashboard' || view === 'portfolio') {
    const [projects, applications, notifications, portfolio] = await Promise.all([
      db.project.findMany({
        where: { OR: [{ clientId: user.id }, { assignedStudentId: user.id }] },
        orderBy: { updatedAt: 'desc' },
        include: {
          payment: true,
          agreements: {
            orderBy: { number: 'desc' },
            take: 1,
            select: { clientApprovedAt: true, studentApprovedAt: true },
          },
          _count: { select: { applications: { where: { status: 'active' } } } },
        },
        take: 100,
      }),
      db.application.findMany({
        where: { studentId: user.id },
        include: { project: { select: publicProject } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      db.notification.findMany({
        where: { userId: user.id },
        select: { id: true, userId: true, text: true, url: true, readAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      db.portfolioRecord.findMany({
        where: { studentId: user.id },
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { category: true, demo: true, status: true } } },
      }),
    ]);
    const safeProjects = projects.map((project) => {
      const agreed =
        project.agreements[0]?.clientApprovedAt && project.agreements[0]?.studentApprovedAt;
      return {
        ...project,
        agreements: undefined,
        ...(project.clientId !== user.id && !agreed
          ? { locationPrivate: '', contactPrivate: '' }
          : {}),
      };
    });
    return {
      user: { id: user.id, name: user.name, roles: user.roles },
      currentUser: { id: user.id, name: user.name, roles: user.roles },
      projects: safeProjects,
      applications,
      notifications,
      portfolio,
    };
  }
  if (view === 'work') {
    const project = await db.project.findUnique({
      where: { id: params.get('id') || '' },
      include: {
        client: { select: publicUser },
        assignedStudent: { select: { id: true, name: true } },
        agreements: { orderBy: { number: 'desc' } },
        milestones: { orderBy: { id: 'asc' } },
        submissions: { orderBy: { createdAt: 'desc' }, include: { revisions: true } },
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, name: true } } },
        },
        payment: true,
        portfolio: true,
        reviews: { include: { author: { select: { id: true, name: true } } } },
      },
    });
    assert(project, 404, 'Заказ не найден.');
    participant(project, user);
    // Exact meeting/contact details are revealed only after both participants approve.
    const latest = project.agreements[0];
    const agreed = latest?.clientApprovedAt && latest?.studentApprovedAt;
    const milestones = project.milestones.filter(
      (item) =>
        item.agreementNumber ===
        (project.agreements.find((item) => item.clientApprovedAt && item.studentApprovedAt)
          ?.number ?? 1),
    );
    const safeProject = {
      ...project,
      milestones,
      agreements: project.agreements.map((item) => ({
        ...item,
        snapshotJson:
          project.clientId === user.id || (item.clientApprovedAt && item.studentApprovedAt)
            ? item.snapshotJson
            : {
                ...(item.snapshotJson as Prisma.JsonObject),
                locationPrivate: '',
                contactPrivate: '',
              },
      })),
      ...(project.clientId !== user.id && !agreed
        ? { locationPrivate: '', contactPrivate: '' }
        : {}),
    };
    return {
      project: safeProject,
      currentUser: { id: user.id, name: user.name, roles: user.roles },
      agreements: safeProject.agreements,
      milestones,
      submissions: project.submissions,
      events: project.events,
      payment: project.payment,
      portfolio: project.portfolio,
      reviews: project.reviews,
    };
  }
  if (view === 'applications') {
    const project = await loadProject(db, params.get('projectId') || '');
    client(project, user);
    const applications = await db.application.findMany({
      where: { projectId: project.id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            demo: true,
            status: true,
            studentProfile: true,
            avatar: { select: { isPublic: true, revision: true } },
            externalWorks: { where: publicCaseWhere, orderBy: caseOrder },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const publicStudentIds = [
      ...new Set(
        applications.flatMap(({ student }) =>
          student.status === 'active' &&
          student.studentProfile?.isPublic &&
          (!student.demo || config.demoEnabled)
            ? [student.id]
            : [],
        ),
      ),
    ];
    const publishedRecords = publicStudentIds.length
      ? await db.portfolioRecord.findMany({
          where: {
            studentId: { in: publicStudentIds },
            visibility: { in: ['public', 'redacted_public'] },
            clientConsentAt: { not: null },
            studentConsentAt: { not: null },
            project: {
              status: { in: ['accepted', 'completed'] },
              events: { some: { action: 'acceptSubmission' } },
              ...(config.demoEnabled ? {} : { demo: false }),
            },
          },
          select: { studentId: true, project: { select: { assignedStudentId: true } } },
        })
      : [];
    const confirmedCounts = new Map<string, number>();
    for (const record of publishedRecords) {
      if (record.project.assignedStudentId !== record.studentId) continue;
      confirmedCounts.set(record.studentId, (confirmedCounts.get(record.studentId) ?? 0) + 1);
    }
    return {
      project,
      applications: applications.map((application) => {
        const { status, avatar, ...student } = application.student;
        const profileAvailable = Boolean(
          status === 'active' &&
          student.studentProfile?.isPublic &&
          (!student.demo || config.demoEnabled),
        );
        return {
          ...application,
          student: {
            ...student,
            studentProfile: student.studentProfile
              ? visibleStudentProfile(student.studentProfile)
              : null,
            profileAvailable,
            avatarRevision: profileAvailable && avatar?.isPublic ? avatar.revision : null,
            confirmedWorks: profileAvailable ? (confirmedCounts.get(student.id) ?? 0) : null,
          },
        };
      }),
    };
  }
  throw new Error('Unsupported query dispatch');
}
