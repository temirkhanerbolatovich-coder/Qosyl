import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { db } from '../src/lib/db';
import { AppError } from '../src/lib/permissions';
import { queryThreads, threadsStatus } from '../src/server/leads/threads-service';
const target = new URL(process.env.DATABASE_TEST_URL ?? 'invalid:');
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname != '/student_marketplace_e2e' ||
  target.toString() !== new URL(process.env.DATABASE_URL ?? 'invalid:').toString()
)
  throw Error('Isolated database required');
const status = (code: number) => (e: unknown) => e instanceof AppError && e.status === code;
test('Threads preview authorization, quotas and switches on PostgreSQL + HTTP', async () => {
  const env = {
    enabled: process.env.THREADS_SEARCH_ENABLED,
    token: process.env.THREADS_ACCESS_TOKEN,
  };
  let calls = 0,
    httpStatus = 200,
    disableDuringCall = false;
  const server = createServer((_req, res) => {
    calls++;
    if (disableDuringCall) process.env.THREADS_SEARCH_ENABLED = 'false';
    res.writeHead(httpStatus, { 'Content-Type': 'application/json', 'Retry-After': '90' });
    res.end(
      JSON.stringify({
        data: [
          {
            id: '12345',
            text: 'Синтетический запрос на таблицу для небольшого бизнеса.',
            username: 'fixture',
            permalink: 'https://www.threads.com/@fixture/post/ABC',
            timestamp: '2026-10-25T12:00:00Z',
          },
        ],
      }),
    );
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address === 'object');
    const fetcher: typeof fetch = (input, init) => {
      const url = new URL(String(input));
      return fetch(`http://127.0.0.1:${address.port}${url.pathname}${url.search}`, init);
    };
    const admin = await db.user.create({
      data: {
        id: randomUUID(),
        email: `${randomUUID()}@example.test`,
        name: 'Threads fixture',
        roles: ['admin'],
        emailVerified: true,
      },
    });
    const student = await db.user.create({
      data: {
        id: randomUUID(),
        email: `${randomUUID()}@example.test`,
        name: 'Threads other role',
        roles: ['student'],
        emailVerified: true,
      },
    });
    await db.rateLimit.deleteMany({
      where: { key: { in: ['threads:global', 'threads:cooldown'] } },
    });
    process.env.THREADS_SEARCH_ENABLED = 'false';
    delete process.env.THREADS_ACCESS_TOKEN;
    assert.deepEqual(await threadsStatus(admin), { enabled: false, configured: false });
    await assert.rejects(queryThreads({ query: 'test' }, student, { fetcher }), status(403));
    await assert.rejects(queryThreads({ query: 'test' }, admin, { fetcher }), status(503));
    assert.equal(calls, 0);
    process.env.THREADS_SEARCH_ENABLED = 'true';
    process.env.THREADS_ACCESS_TOKEN = 'synthetic-token';
    const before = await db.lead.count(),
      projects = await db.project.count();
    assert.equal((await queryThreads({ query: 'таблица' }, admin, { fetcher })).items.length, 1);
    assert.equal(await db.lead.count(), before);
    assert.equal(await db.project.count(), projects);
    await db.user.update({ where: { id: admin.id }, data: { roles: ['student'] } });
    await assert.rejects(queryThreads({ query: 'test' }, admin, { fetcher }), status(403));
    assert.equal(calls, 1);
    await db.user.update({ where: { id: admin.id }, data: { roles: ['admin'] } });
    disableDuringCall = true;
    await assert.rejects(queryThreads({ query: 'test' }, admin, { fetcher }), status(503));
    disableDuringCall = false;
    process.env.THREADS_SEARCH_ENABLED = 'true';
    httpStatus = 429;
    await assert.rejects(queryThreads({ query: 'test' }, admin, { fetcher }), status(429));
    const afterThrottle = calls;
    await assert.rejects(queryThreads({ query: 'test' }, admin, { fetcher }), status(429));
    assert.equal(calls, afterThrottle);
    await db.rateLimit.deleteMany({ where: { key: 'threads:cooldown' } });
    httpStatus = 200;
    await db.rateLimit.update({ where: { key: 'threads:global' }, data: { count: 99 } });
    const results = await Promise.allSettled([
      queryThreads({ query: 'test' }, admin, { fetcher }),
      queryThreads({ query: 'test' }, admin, { fetcher }),
    ]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(calls, afterThrottle + 1);
    const rejected = results.find((x) => x.status === 'rejected');
    assert(rejected?.status === 'rejected' && status(429)(rejected.reason));
    console.log('No Lead/Project written; fake provider only; shared quota and cooldown enforced.');
  } finally {
    if (env.enabled === undefined) delete process.env.THREADS_SEARCH_ENABLED;
    else process.env.THREADS_SEARCH_ENABLED = env.enabled;
    if (env.token === undefined) delete process.env.THREADS_ACCESS_TOKEN;
    else process.env.THREADS_ACCESS_TOKEN = env.token;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
