import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  transaction: vi.fn(),
  userFind: vi.fn(),
  userUpdate: vi.fn(),
  studentUpsert: vi.fn(),
  clientUpsert: vi.fn(),
  externalDelete: vi.fn(),
  externalCreate: vi.fn(),
  moderationCreate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.session }));
vi.mock('@/lib/config', () => ({ config: { baseUrl: 'http://localhost:3000' } }));
vi.mock('@/lib/db', () => ({ db: { $transaction: mocks.transaction } }));

import { GET, POST } from '../src/app/api/profile/route';

const user = {
  id: 'current-user',
  name: 'Тестовый участник',
  email: 'participant@example.test',
  roles: ['student'],
  demo: false,
  studentProfile: { bio: 'Собственный профиль' },
  clientProfile: null,
  externalWorks: [],
  statusReason: 'internal-status-details',
  accounts: [{ password: 'never-return-authentication-fields' }],
};
const input = { role: 'student', name: 'Новое имя', city: 'Семей' };
const tx = {
  user: { findUnique: mocks.userFind, update: mocks.userUpdate },
  studentProfile: { upsert: mocks.studentUpsert },
  clientProfile: { upsert: mocks.clientUpsert },
  externalPortfolioItem: { deleteMany: mocks.externalDelete, createMany: mocks.externalCreate },
  moderationAction: { create: mocks.moderationCreate },
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/profile', {
    method: 'POST',
    headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.session.mockResolvedValue(user);
  mocks.userFind.mockResolvedValue({ id: user.id, status: 'active', roles: ['student'] });
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
});
afterEach(() => vi.restoreAllMocks());

describe('Self-profile API boundary', () => {
  it('returns an explicit private projection without authentication or internal status fields', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        demo: false,
        studentProfile: user.studentProfile,
        clientProfile: null,
        externalWorks: [],
      },
    });
  });

  it('returns a non-cacheable JSON401 for an anonymous read', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual({ error: 'Войдите в аккаунт.', code: 'UNAUTHENTICATED' });
  });

  it('contains a session/database read failure inside the JSON contract without sensitive details', async () => {
    mocks.session.mockRejectedValue(new Error('postgres://private-credential@internal-host'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual({
      error: 'Не удалось загрузить профиль. Повторите позже.',
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('checks the origin before reading the session or changing data', async () => {
    const response = await POST(request(input, { Origin: 'https://untrusted.example' }));
    expect(response.status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and a JSON media-type lookalike', async () => {
    expect((await POST(request('{'))).status).toBe(400);
    expect(
      (await POST(request(input, { 'Content-Type': 'application/json-invalid' }))).status,
    ).toBe(415);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('returns validation fields for attempted administrative-role escalation', async () => {
    const response = await POST(request({ ...input, role: 'admin' }));
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const result = await response.json();
    expect(result.error).toBe('Проверьте имя, город, ссылки и остальные поля профиля.');
    expect(result.fields).toHaveProperty('role');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects an oversized streamed request before starting a transaction', async () => {
    const response = await POST(request({ ...input, bio: 'x'.repeat(17_000) }));
    expect(response.status).toBe(413);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('adds a permitted working role while preserving existing roles and audit', async () => {
    mocks.userFind.mockResolvedValue({ id: user.id, status: 'active', roles: ['client'] });
    const response = await POST(
      request(input, { 'Content-Type': 'application/json; charset=utf-8' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual({ data: { saved: true, role: 'student' } });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { name: input.name, roles: ['client', 'student'] },
    });
    expect(mocks.moderationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: user.id,
        targetId: user.id,
        action: 'profile_updated',
      }),
    });
  });

  it('rechecks account suspension inside the transaction and performs no updates', async () => {
    mocks.userFind.mockResolvedValue({ id: user.id, status: 'suspended', roles: ['student'] });
    const response = await POST(request(input));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Аккаунт недоступен.', code: 'FORBIDDEN' });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.studentUpsert).not.toHaveBeenCalled();
    expect(mocks.moderationCreate).not.toHaveBeenCalled();
  });

  it('invalidates client verification when its reviewed profile changes', async () => {
    const response = await POST(
      request({ ...input, role: 'client', organisationName: 'Организация' }),
    );
    expect(response.status).toBe(200);
    expect(mocks.clientUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: user.id },
        update: expect.objectContaining({
          verificationStatus: 'pending',
          verificationReason: null,
        }),
      }),
    );
  });

  it('returns a safe503 when the profile transaction fails', async () => {
    mocks.transaction.mockRejectedValue(new Error('private-database-internals'));
    const response = await POST(request(input));
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual({
      error: 'Не удалось сохранить профиль. Повторите позже.',
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
