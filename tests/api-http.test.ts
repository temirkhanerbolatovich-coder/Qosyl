import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/config', () => ({ config: { baseUrl: 'http://localhost:3000' } }));
import { apiFailure, apiSuccess, readJsonObject, requireSameOrigin } from '../src/server/api/http';
import { AppError } from '../src/lib/permissions';

afterEach(() => vi.restoreAllMocks());
describe('shared API transport', () => {
  it('returns compatible envelopes and no-store for successes and failures', async () => {
    const success = apiSuccess({ ok: true });
    expect(await success.json()).toEqual({ data: { ok: true } });
    expect(success.headers.get('Cache-Control')).toContain('no-store');
    const denied = apiFailure(new AppError(403, 'Недоступно.'), 'test.operation');
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: 'Недоступно.', code: 'FORBIDDEN' });
    expect(denied.headers.get('Cache-Control')).toContain('no-store');
  });
  it('accepts JSON with charset and rejects misleading media-type prefixes', async () => {
    const request = (type: string) =>
      new Request('http://localhost:3000/api/platform', {
        method: 'POST',
        headers: { 'Content-Type': type },
        body: '{"action":"createProject"}',
      });
    expect(await readJsonObject(request('Application/JSON; charset=utf-8'), 1024)).toEqual({
      action: 'createProject',
    });
    await expect(readJsonObject(request('application/json-invalid'), 1024)).rejects.toMatchObject({
      status: 415,
    });
  });
  it.each(['null', '[]', '"text"', '{'])(
    'rejects non-object or malformed JSON: %s',
    async (body) => {
      const request = new Request('http://localhost:3000/api/platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      await expect(readJsonObject(request, 1024)).rejects.toMatchObject({ status: 400 });
    },
  );
  it('bounds streamed bytes even when Content-Length understates the body', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(100));
        controller.enqueue(new Uint8Array(100));
        controller.close();
      },
    });
    const request = new Request('http://localhost:3000/api/platform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '1' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readJsonObject(request, 150)).rejects.toMatchObject({ status: 413 });
  });
  it('rejects absent or foreign origins', () => {
    const make = (origin?: string) =>
      new Request('http://localhost:3000/api/platform', {
        headers: origin ? { Origin: origin } : {},
      });
    expect(() => requireSameOrigin(make())).toThrow();
    expect(() => requireSameOrigin(make('https://foreign.example'))).toThrow();
    expect(() => requireSameOrigin(make('http://localhost:3000'))).not.toThrow();
  });
  it('maps database concurrency failures to conflicts', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('private query details', {
      code: 'P2034',
      clientVersion: 'test',
    });
    const response = apiFailure(error, 'test.operation');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'CONFLICT' });
  });
  it('returns field validation errors and hides unexpected exception text in responses and logs', async () => {
    const invalid = z.object({ city: z.string() }).safeParse({ city: 123 });
    if (invalid.success) throw new Error('Expected invalid input');
    const validation = apiFailure(invalid.error, 'test.operation', { includeFields: true });
    expect(await validation.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { city: expect.any(Array) },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = apiFailure(new Error('secret-internal-value'), 'test.operation');
    expect(failure.status).toBe(500);
    expect(JSON.stringify(await failure.json())).not.toContain('secret-internal-value');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-internal-value');
  });
});
