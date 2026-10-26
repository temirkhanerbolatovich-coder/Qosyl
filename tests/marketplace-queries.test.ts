import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@prisma/client';
const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  application: vi.fn(),
  config: { demoEnabled: true },
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/config', () => ({ config: mocks.config }));
vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: mocks.project },
    application: { findUnique: mocks.application },
  },
}));
import { publicQueries } from '../src/server/marketplace/queries/public';

const moderatorStudent = { id: 'moderator', roles: ['admin', 'student'] } as User;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.demoEnabled = true;
  mocks.application.mockResolvedValue(null);
});

describe('project eligibility agrees with mutation guards', () => {
  it.each([
    {
      name: 'open real project',
      expired: false,
      suspended: false,
      demo: false,
      allowed: true,
      enabled: true,
      canApply: true,
    },
    {
      name: 'expired project visible for moderation',
      expired: true,
      suspended: false,
      demo: false,
      allowed: true,
      enabled: true,
      canApply: false,
    },
    {
      name: 'suspended client visible for moderation',
      expired: false,
      suspended: true,
      demo: false,
      allowed: true,
      enabled: true,
      canApply: false,
    },
    {
      name: 'closed demo example',
      expired: false,
      suspended: false,
      demo: true,
      allowed: false,
      enabled: true,
      canApply: false,
    },
    {
      name: 'disabled demo',
      expired: false,
      suspended: false,
      demo: true,
      allowed: true,
      enabled: false,
      canApply: false,
    },
  ])('$name', async ({ expired, suspended, demo, allowed, enabled, canApply }) => {
    mocks.config.demoEnabled = enabled;
    mocks.project.mockResolvedValue({
      id: 'project',
      clientId: 'client',
      assignedStudentId: null,
      status: 'published',
      dueAt: new Date(Date.now() + (expired ? -1 : 1) * 86_400_000),
      client: { status: suspended ? 'suspended' : 'active' },
      demo,
      demoApplicationsAllowed: allowed,
    });
    const result = await publicQueries(
      new URLSearchParams('view=project&id=project'),
      moderatorStudent,
    );
    expect(result).toMatchObject({ canApply });
  });
});
