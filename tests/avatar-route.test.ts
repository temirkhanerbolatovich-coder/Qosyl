import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  begin: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  sanitize: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.session }));
vi.mock('@/lib/config', () => ({ config: { baseUrl: 'http://localhost:3000' } }));
vi.mock('@/server/profile/avatar', () => ({
  beginAvatarMutation: mocks.begin,
  readOwnAvatar: mocks.read,
  writeAvatar: mocks.write,
}));
vi.mock('@/server/profile/avatar-image', () => ({ sanitizeAvatar: mocks.sanitize }));
import { GET, POST, PATCH, DELETE } from '../src/app/api/profile/avatar/route';
import { MAX_AVATAR_BYTES } from '../src/lib/avatar';
const req = (
  method: string,
  body: BodyInit,
  contentType = 'image/png',
  origin = 'http://localhost:3000',
) =>
  new Request('http://localhost:3000/api/profile/avatar', {
    method,
    headers: { Origin: origin, 'Content-Type': contentType },
    body,
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ id: 'owner' });
  mocks.sanitize.mockResolvedValue(Buffer.from('sanitized'));
});
it('rejects guest and cross-origin mutations before reading bytes', async () => {
  expect((await POST(req('POST', 'bytes', 'image/png', 'https://other.example'))).status).toBe(403);
  expect(mocks.session).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await POST(req('POST', 'bytes'))).status).toBe(401);
  expect(mocks.begin).not.toHaveBeenCalled();
});
it('uses session ownership and only writes sanitized bytes', async () => {
  expect((await POST(req('POST', 'untrusted'))).status).toBe(200);
  expect(mocks.begin).toHaveBeenCalledWith('owner');
  expect(mocks.write).toHaveBeenCalledWith('owner', { bytes: Buffer.from('sanitized') });
});
it('bounds the stream without Content-Length and counts rejected attempts', async () => {
  expect((await POST(req('POST', new Uint8Array(MAX_AVATAR_BYTES + 1)))).status).toBe(413);
  expect(mocks.begin).toHaveBeenCalledOnce();
  expect(mocks.sanitize).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});
it('rejects SVG, owner spoofing, and mutation without a revision', async () => {
  expect((await POST(req('POST', '<svg/>', 'image/svg+xml'))).status).toBe(415);
  expect(
    (
      await PATCH(
        req(
          'PATCH',
          JSON.stringify({
            revision: 'dbfd6db7-dede-4c4b-a212-15f8094b66cb',
            isPublic: true,
            userId: 'other',
          }),
          'application/json',
        ),
      )
    ).status,
  ).toBe(400);
  expect((await DELETE(req('DELETE', '{}', 'application/json'))).status).toBe(400);
  expect(mocks.write).not.toHaveBeenCalled();
});
