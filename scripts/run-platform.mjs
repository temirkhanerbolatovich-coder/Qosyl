import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLifecycleSettings } from '../src/lib/lifecycle-settings.mjs';

// Force-termination on Windows cannot run the parent's cleanup handlers. Owned
// children preload this module and stop if their supervisor disappears.
const parentValue = process.env.QOSYL_PLATFORM_PARENT_PID;
if (parentValue !== undefined) {
  const parentPid = Number(parentValue);
  if (!Number.isInteger(parentPid) || parentPid <= 0) throw new Error('Invalid platform parent.');
  const watchdog = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      console.error('platform_parent_lost');
      process.exit(1);
    }
  }, 1000);
  watchdog.unref();
}

/** Own direct web/worker children as one service; a dead child must not leave a partial platform. */
export function superviseProcesses(
  commands,
  { env = process.env, cwd = process.cwd(), stdio = 'inherit' } = {},
) {
  if (!commands.length) throw new Error('At least one platform process is required.');
  return new Promise((resolveExit) => {
    const children = new Set();
    let stopping = false;
    let exitCode = 0;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
      resolveExit(exitCode);
    };
    const stop = (code) => {
      if (stopping) return;
      stopping = true;
      exitCode = code;
      for (const child of children) child.kill('SIGTERM');
      // SQL locks are transaction-scoped: an unresponsive child can be killed without a stale lease.
      timer = setTimeout(() => {
        for (const child of children) child.kill('SIGKILL');
      }, 20_000);
      if (!children.size) cleanup();
    };
    const interrupt = () => stop(130);
    const terminate = () => stop(143);
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    for (const command of commands) {
      if (stopping) break;
      const child = spawn(process.execPath, ['--import', import.meta.url, ...command.args], {
        env: { ...env, QOSYL_PLATFORM_PARENT_PID: String(process.pid) },
        cwd,
        stdio,
        windowsHide: true,
      });
      children.add(child);
      child.once('error', () => {
        console.error('platform_child_failed', command.name);
        children.delete(child);
        stop(1);
        if (!children.size) cleanup();
      });
      child.once('exit', (code) => {
        children.delete(child);
        if (!stopping) {
          console.error('platform_child_exited', command.name);
          stop(code && code > 0 ? code : 1);
        }
        if (!children.size) cleanup();
      });
    }
  });
}

async function main() {
  await import('dotenv/config');
  const settings = getLifecycleSettings(process.env);
  const check = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-env.ts'], {
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (check.status !== 0) return check.status || 1;
  const args = process.argv.slice(2);
  const webArgs = args.length ? args : ['--hostname', '127.0.0.1'];
  const commands = [
    { name: 'web', args: ['node_modules/next/dist/bin/next', 'start', ...webArgs] },
    {
      name: 'content',
      args: ['--conditions=react-server', '--import', 'tsx', 'scripts/content-worker.ts'],
    },
  ];
  if (settings.enabled) {
    commands.push({
      name: 'lifecycle',
      args: ['--conditions=react-server', '--import', 'tsx', 'scripts/project-lifecycle-worker.ts'],
    });
  } else console.log('project_lifecycle_disabled');
  return superviseProcesses(commands);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.error('platform_start_failed: проверьте конфигурацию и доступность зависимостей.');
      process.exitCode = 1;
    });
}
