import 'server-only';

import type { Prisma } from '@prisma/client';

export const publicUser = {
  id: true,
  name: true,
  demo: true,
  clientProfile: { select: { name: true, verificationStatus: true } },
} satisfies Prisma.UserSelect;
export const publicProject = {
  id: true,
  title: true,
  category: true,
  problem: true,
  description: true,
  deliverables: true,
  acceptanceCriteria: true,
  skills: true,
  difficulty: true,
  mode: true,
  city: true,
  budgetKzt: true,
  estimatedHours: true,
  dueAt: true,
  preferredTime: true,
  status: true,
  demo: true,
  demoApplicationsAllowed: true,
  publishedAt: true,
  createdAt: true,
  client: { select: publicUser },
} satisfies Prisma.ProjectSelect;
