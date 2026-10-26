import 'server-only';
import { Prisma, type User } from '@prisma/client';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { assert, isParticipant } from '@/lib/permissions';
import { categories } from '@/lib/validation';
import { publicProject, publicUser } from '../projections';
import { parseCatalogQuery } from '@/lib/catalog-query';

export async function publicQueries(params: URLSearchParams, user: User | null) {
  const view = params.get('view') || 'catalog';
  if (view === 'catalog') {
    const filters = parseCatalogQuery(params);
    const q = filters.q || '';
    const due = filters.dueBefore;
    const where: Prisma.ProjectWhereInput = {
      status: 'published',
      dueAt: { gt: new Date(), ...(due ? { lte: new Date(due) } : {}) },
      client: { status: 'active' },
      ...(!config.demoEnabled ? { demo: false } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { skills: { has: q } },
            ],
          }
        : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.skill ? { skills: { has: filters.skill } } : {}),
      ...(filters.mode ? { mode: filters.mode } : {}),
      ...(filters.city ? { city: { contains: filters.city, mode: 'insensitive' } } : {}),
      ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
      budgetKzt: { gte: filters.minBudget, lte: filters.maxBudget },
      estimatedHours: { lte: filters.maxHours },
    };
    const page = filters.page;
    if (filters.sort === 'relevance') {
      // Pilot-scale ranking reads only IDs/title/skills; full private project rows never leave the DB.
      const candidates = await db.project.findMany({
        where,
        select: { id: true, title: true, skills: true, publishedAt: true },
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      });
      const profile = user
        ? await db.studentProfile.findUnique({
            where: { userId: user.id },
            select: { skills: true },
          })
        : null;
      const desired = new Set(
        [filters.skill, ...(profile?.skills ?? [])]
          .filter(Boolean)
          .map((value) => value!.toLocaleLowerCase()),
      );
      const score = (item: (typeof candidates)[number]) =>
        (q && item.title.toLocaleLowerCase().includes(q.toLocaleLowerCase()) ? 3 : 0) +
        item.skills.filter((skill) => desired.has(skill.toLocaleLowerCase())).length;
      candidates.sort((a, b) => score(b) - score(a));
      const ids = candidates.slice((page - 1) * 30, page * 30).map((item) => item.id);
      const rows = await db.project.findMany({ where: { id: { in: ids } }, select: publicProject });
      const projects = ids.map((id) => rows.find((item) => item.id === id)!);
      return { projects, total: candidates.length, categories, page };
    }
    const [projects, total] = await Promise.all([
      db.project.findMany({
        where,
        select: publicProject,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        take: 30,
        skip: (page - 1) * 30,
      }),
      db.project.count({ where }),
    ]);
    return { projects, total, categories, page };
  }
  if (view === 'project') {
    const id = params.get('id') || '';
    const project = await db.project.findUnique({
      where: { id },
      select: {
        ...publicProject,
        clientId: true,
        assignedStudentId: true,
        client: { select: { ...publicUser, status: true } },
      },
    });
    assert(project, 404, 'Заказ не найден.');
    const owner = user && isParticipant(project, user.id);
    assert(
      owner ||
        user?.roles.includes('admin') ||
        (project.status === 'published' &&
          project.dueAt > new Date() &&
          project.client.status === 'active' &&
          (!project.demo || config.demoEnabled)),
      404,
      'Заказ не найден или еще не опубликован.',
    );
    const application = user
      ? await db.application.findUnique({
          where: { projectId_studentId: { projectId: id, studentId: user.id } },
        })
      : null;
    const ownProject =
      user?.id === project.clientId
        ? await db.project.findUnique({
            where: { id },
            include: { client: { select: publicUser } },
          })
        : project;
    return {
      project: ownProject,
      application,
      canApply:
        !!user &&
        user.roles.includes('student') &&
        user.id !== project.clientId &&
        project.status === 'published' &&
        project.dueAt > new Date() &&
        project.client.status === 'active' &&
        (!project.demo || (config.demoEnabled && project.demoApplicationsAllowed)) &&
        (!application || application.status === 'withdrawn'),
    };
  }
  throw new Error('Unsupported query dispatch');
}
