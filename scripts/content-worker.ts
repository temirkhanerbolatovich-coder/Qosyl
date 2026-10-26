import 'dotenv/config';
import { setTimeout as wait } from 'node:timers/promises';

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== '--once')) throw new Error('Unknown argument');
  const { db } = await import('../src/lib/db');
  const { runContentIntake } = await import('../src/server/content/worker');
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    do {
      try {
        const result = await runContentIntake(db);
        if (result.status !== 'idle') console.log('content_intake_pass', result);
        if (result.status === 'failed' && process.argv.includes('--once')) process.exitCode = 1;
      } catch {
        console.error('content_worker_pass_failed');
        if (process.argv.includes('--once')) {
          process.exitCode = 1;
          return;
        }
      }
      if (process.argv.includes('--once') || controller.signal.aborted) break;
      try {
        await wait(15000, undefined, { signal: controller.signal });
      } catch {
        break;
      }
    } while (!controller.signal.aborted);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('content_worker_start_failed');
  process.exitCode = 1;
});
