import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { getLifecycleSettings } from '../src/lib/lifecycle-settings.mjs';

type PassResult = {
  status: string;
  expiredProjects: number;
  remindersCreated: number;
  scannedProjects: number;
};

/** Await each transaction before scheduling another pass; shutdown never starts a fresh pass. */
export async function runLifecycleLoop(
  pass: () => Promise<PassResult>,
  { once, intervalMs }: { once: boolean; intervalMs: number },
  signal: AbortSignal,
) {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const result = await pass();
      failures = 0;
      console.log('project_lifecycle_pass', {
        status: result.status,
        expiredProjects: result.expiredProjects,
        remindersCreated: result.remindersCreated,
        scannedProjects: result.scannedProjects,
      });
    } catch {
      failures += 1;
      console.error('project_lifecycle_pass_failed');
      if (once) return 1;
    }
    if (once || signal.aborted) return 0;
    const waitMs = failures ? Math.min(60_000, 1000 * 2 ** Math.min(failures - 1, 6)) : intervalMs;
    try {
      await delay(waitMs, undefined, { signal });
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
  return 0;
}

export async function runLifecycleCommand(
  args = process.argv.slice(2),
  environment: Record<string, string | undefined> = process.env,
) {
  if (args.some((arg) => arg !== '--once') || args.length > 1) {
    throw new Error('Разрешён только параметр --once.');
  }
  const settings = getLifecycleSettings(environment);
  if (!settings.enabled) {
    console.log('project_lifecycle_disabled');
    return 0;
  }
  // Disabled mode exits before loading database modules or opening a connection.
  const { db } = await import('../src/lib/db');
  const { runProjectLifecycle } = await import('../src/server/lifecycle/worker');
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    return await runLifecycleLoop(
      () => runProjectLifecycle(db, { batchSize: settings.batchSize }),
      { once: args.includes('--once'), intervalMs: settings.intervalMs },
      controller.signal,
    );
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await db.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  import('dotenv/config')
    .then(() => runLifecycleCommand())
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.error('project_lifecycle_start_failed: проверьте параметры запуска и конфигурацию.');
      process.exitCode = 1;
    });
}
