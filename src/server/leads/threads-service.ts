import 'server-only';
import type { User } from '@prisma/client';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { assert, AppError, requireRole } from '@/lib/permissions';
import { threadsSearchInput, threadsSettings } from '@/lib/threads-search';
import { rate } from '@/server/marketplace/shared';
import { searchThreads, ThreadsSearchError } from './threads-client';

async function admin(session: User) {
  requireRole(session.roles, 'admin');
  const fresh = await db.user.findUnique({ where: { id: session.id } });
  assert(
    fresh?.status === 'active' && (!fresh.demo || config.demoEnabled),
    403,
    'Аккаунт недоступен.',
  );
  requireRole(fresh.roles, 'admin');
  assert(config.localMode || fresh.emailVerified, 403, 'Сначала подтвердите email.');
}
export async function threadsStatus(session: User) {
  await admin(session);
  const settings = threadsSettings();
  return { enabled: settings.enabled, configured: !!settings.token };
}

/** Preview only. Quota is committed before I/O, so failed provider calls count too. */
export async function queryThreads(
  raw: Record<string, unknown>,
  session: User,
  options: Parameters<typeof searchThreads>[2] = {},
) {
  await admin(session);
  const { query } = threadsSearchInput.parse(raw),
    settings = threadsSettings();
  assert(
    settings.enabled && settings.token,
    503,
    'Поиск Threads выключен или токен ещё не настроен. Инструкция: docs/threads-search.md.',
  );
  await db.$transaction(async (tx) => {
    // Serialize the shared counters across processes without holding a lock during HTTP.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('qosyl:threads-search'))::text`;
    const cooldown = await tx.rateLimit.findUnique({ where: { key: 'threads:cooldown' } });
    assert(
      !cooldown || Number(cooldown.lastRequest) <= Date.now(),
      429,
      'Threads: действует пауза после ограничения провайдера.',
    );
    await rate(tx, `threads:admin:${session.id}`, 5, 60000);
    await rate(tx, 'threads:global', 100, 86400000);
  });
  try {
    // Recheck after queueing; disabled configuration must never start a new request.
    const before = threadsSettings();
    assert(
      before.enabled && before.token === settings.token,
      503,
      'Настройки Threads изменились. Повторите позже.',
    );
    const result = await searchThreads(query, settings.token, options);
    await admin(session);
    const after = threadsSettings();
    assert(
      after.enabled && after.token === settings.token,
      503,
      'Поиск Threads выключен. Результат не принят.',
    );
    return result;
  } catch (error) {
    if (error instanceof ThreadsSearchError && error.kind === 'rate') {
      const until = BigInt(Date.now() + (error.retryAfterSeconds ?? 60) * 1000);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('qosyl:threads-search'))::text`;
        const current = await tx.rateLimit.findUnique({ where: { key: 'threads:cooldown' } });
        const lastRequest = current && current.lastRequest > until ? current.lastRequest : until;
        await tx.rateLimit.upsert({
          where: { key: 'threads:cooldown' },
          create: { key: 'threads:cooldown', count: 1, lastRequest },
          update: { lastRequest },
        });
      });
    }
    if (error instanceof ThreadsSearchError)
      throw new AppError(error.kind === 'rate' ? 429 : 503, error.message);
    throw error;
  }
}
