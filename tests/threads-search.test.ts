import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
vi.mock('server-only', () => ({}));
import { searchThreads, ThreadsSearchError } from '../src/server/leads/threads-client';
import { threadsSearchInput, threadsSettings } from '../src/lib/threads-search';
import { buildApiSpec } from '../scripts/generate-api-spec';

const post = {
  id: '123456789',
  text: 'Синтетическая потребность: нужна таблица для учёта заказов.',
  username: 'Sample_User',
  permalink: 'https://www.threads.net/@Sample_User/post/ABC_123?utm_source=test#x',
  timestamp: '2026-10-25T12:00:00+0000',
};
let handler: (res: ServerResponse) => void;
let lastUrl: URL;
const server = createServer((req, res) => {
  lastUrl = new URL(req.url!, 'http://fixture');
  handler(res);
});
let origin: string;
const transport: typeof fetch = (input, init) => {
  const url = new URL(String(input));
  expect(url.origin).toBe('https://graph.threads.net');
  return fetch(origin + url.pathname + url.search, init);
};
beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((e) => (e ? reject(e) : resolve()));
    }),
);
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => {
  handler = (res) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(value));
  };
};

describe('Threads official search over real HTTP fixture', () => {
  it('defaults off, validates the narrow contract and documents the route', () => {
    expect(threadsSettings({ NODE_ENV: 'test' })).toEqual({ enabled: false, token: '' });
    expect(threadsSearchInput.safeParse({ query: ' x ' }).success).toBe(false);
    expect(threadsSearchInput.safeParse({ query: 'test', access_token: 'secret' }).success).toBe(
      false,
    );
    expect(threadsSearchInput.parse({ query: ' таблицы ' }).query).toBe('таблицы');
    const route = buildApiSpec().paths['/api/admin/leads/threads'];
    expect(route.post.security.length).toBeGreaterThan(0);
    expect(route.get).toBeDefined();
    expect(route.post.description).toContain('No Lead/Project');
  });
  it('sends only the fixed read request and normalizes a limited private preview', async () => {
    json({
      data: [
        post,
        post,
        { ...post, id: '222', permalink: 'http://localhost/secret' },
        { ...post, id: '333', text: 'short' },
      ],
      paging: { next: 'http://localhost/should-not-run?access_token=secret' },
    });
    const result = await searchThreads('нужна таблица', 'fixture-secret', { fetcher: transport });
    expect(result.items).toHaveLength(1);
    expect(result.discarded).toBe(3);
    expect(result.items[0].sourceUrl).toBe('https://www.threads.com/@sample_user/post/ABC_123');
    expect(result.items[0].publishedAt).toBe('2026-10-25T12:00:00.000Z');
    expect(lastUrl.pathname).toBe('/keyword_search');
    expect(lastUrl.searchParams.get('q')).toBe('нужна таблица');
    expect(lastUrl.searchParams.get('search_type')).toBe('RECENT');
    expect(lastUrl.searchParams.get('limit')).toBe('25');
    expect(lastUrl.searchParams.get('access_token')).toBe('fixture-secret');
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    expect(JSON.stringify(result)).not.toContain('paging');
  });
  it('does not follow redirects or disclose a credential-bearing location', async () => {
    handler = (res) => {
      res.writeHead(302, { Location: origin + '/unexpected?access_token=fixture-secret' });
      res.end();
    };
    await expect(
      searchThreads('test', 'fixture-secret', { fetcher: transport }),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it.each([401, 403])('reports access failure %s without upstream text', async (status) => {
    json({ error: { message: 'fixture-secret' } }, status);
    await expect(
      searchThreads('test', 'fixture-secret', { fetcher: transport }),
    ).rejects.toMatchObject({ kind: 'access' });
  });
  it('handles Graph access errors returned with 400', async () => {
    json({ error: { code: 190, message: 'fixture-secret' } }, 400);
    await expect(
      searchThreads('test', 'fixture-secret', { fetcher: transport }),
    ).rejects.toMatchObject({ kind: 'access' });
  });
  it('honors bounded provider retry-after without retrying automatically', async () => {
    json({}, 429, { 'Retry-After': '120' });
    await expect(searchThreads('test', 'secret', { fetcher: transport })).rejects.toMatchObject({
      kind: 'rate',
      retryAfterSeconds: 120,
    });
    json({ error: { code: 4, message: 'secret' } }, 400);
    await expect(searchThreads('test', 'secret', { fetcher: transport })).rejects.toMatchObject({
      kind: 'rate',
      retryAfterSeconds: 60,
    });
  });
  it('rejects invalid JSON, missing data and oversized chunked bodies', async () => {
    handler = (res) => {
      res.end('<html>fixture-secret</html>');
    };
    await expect(searchThreads('test', 'secret', { fetcher: transport })).rejects.toMatchObject({
      kind: 'invalid',
    });
    json({});
    await expect(searchThreads('test', 'secret', { fetcher: transport })).rejects.toMatchObject({
      kind: 'invalid',
    });
    handler = (res) => {
      res.write('x'.repeat(150000));
      res.end('x'.repeat(150000));
    };
    await expect(searchThreads('test', 'secret', { fetcher: transport })).rejects.toMatchObject({
      kind: 'invalid',
    });
  });
  it('bounds a hanging HTTP request and hides connection errors', async () => {
    handler = () => {};
    await expect(
      searchThreads('test', 'secret', { fetcher: transport, timeoutMs: 30 }),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    const invalidTransport: typeof fetch = () =>
      Promise.reject(new Error('https://host/?access_token=fixture-secret'));
    try {
      await searchThreads('test', 'secret', { fetcher: invalidTransport });
      throw Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ThreadsSearchError);
      expect(String(error)).not.toContain('fixture-secret');
    }
  });
  it('caps candidates even if provider ignores the requested limit', async () => {
    json({
      data: Array.from({ length: 30 }, (_, i) => ({
        ...post,
        id: String(1000 + i),
        permalink: `https://threads.com/@sample/post/P${i}`,
      })),
    });
    const result = await searchThreads('test', 'secret', { fetcher: transport });
    expect(result.items).toHaveLength(25);
    expect(result.discarded).toBe(5);
  });
});
