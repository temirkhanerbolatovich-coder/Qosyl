import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma, User } from '@prisma/client';
vi.mock('server-only', () => ({}));
import { recordProjectView } from '../src/server/pilot/views';

const user = { id: 'student', demo: false, roles: ['student'] } as User;
const project = () => ({
  clientId: 'client',
  demo: false,
  status: 'published',
  dueAt: new Date(Date.now() + 86400000),
  client: { demo: false, status: 'active' },
});
const find = vi.fn();
const create = vi.fn();
const tx = {
  project: { findUnique: find },
  projectView: { createMany: create },
} as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.clearAllMocks();
  find.mockResolvedValue(project());
});

describe('measured student/project views', () => {
  it('uses the authenticated student and deduplicating insert, never a supplied identity', async () => {
    await recordProjectView(tx, { projectId: 'project', studentId: 'another' }, user);
    expect(create).toHaveBeenCalledWith({
      data: [{ projectId: 'project', studentId: user.id }],
      skipDuplicates: true,
    });
  });
  it('requires a student role', async () => {
    await expect(
      recordProjectView(tx, { projectId: 'project' }, { ...user, roles: ['client'] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    { demo: true, roles: ['student'] },
    { demo: false, roles: ['student', 'admin'] },
  ])('does not measure demo students or administrative inspection: %j', async (changes) => {
    expect(await recordProjectView(tx, { projectId: 'project' }, { ...user, ...changes })).toEqual({
      ok: true,
    });
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['draft', 'paused', 'assigned', 'cancelled'])(
    'rejects a non-public project: %s',
    async (status) => {
      find.mockResolvedValue({ ...project(), status });
      await expect(recordProjectView(tx, { projectId: 'project' }, user)).rejects.toMatchObject({
        status: 404,
      });
      expect(create).not.toHaveBeenCalled();
    },
  );
  it('rejects expired projects and suspended clients', async () => {
    find.mockResolvedValueOnce({ ...project(), dueAt: new Date(0) });
    await expect(recordProjectView(tx, { projectId: 'project' }, user)).rejects.toMatchObject({
      status: 404,
    });
    find.mockResolvedValueOnce({ ...project(), client: { demo: false, status: 'suspended' } });
    await expect(recordProjectView(tx, { projectId: 'project' }, user)).rejects.toMatchObject({
      status: 404,
    });
    expect(create).not.toHaveBeenCalled();
  });
  it.each([{ clientId: 'student' }, { demo: true }, { client: { demo: true, status: 'active' } }])(
    'does not count owners or demo projects/clients: %j',
    async (changes) => {
      find.mockResolvedValue({ ...project(), ...changes });
      expect(await recordProjectView(tx, { projectId: 'project' }, user)).toEqual({ ok: true });
      expect(create).not.toHaveBeenCalled();
    },
  );
});
