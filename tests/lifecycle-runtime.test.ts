import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLifecycleSettings } from '../src/lib/lifecycle-settings.mjs';
import { runLifecycleCommand, runLifecycleLoop } from '../scripts/project-lifecycle-worker';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const result = { status: 'completed', expiredProjects: 0, remindersCreated: 0, scannedProjects: 0 };

describe('lifecycle runtime boundaries', () => {
  it('has bounded defaults and rejects ambiguous configuration', () => {
    expect(getLifecycleSettings({})).toEqual({ enabled: true, intervalMs: 60_000, batchSize: 50 });
    for (const invalid of [
      { PROJECT_LIFECYCLE_ENABLED: 'yes' },
      { PROJECT_LIFECYCLE_INTERVAL_MS: '0' },
      { PROJECT_LIFECYCLE_INTERVAL_MS: '1000.5' },
      { PROJECT_LIFECYCLE_BATCH_SIZE: '51' },
      { PROJECT_LIFECYCLE_BATCH_SIZE: '' },
    ])
      expect(() => getLifecycleSettings(invalid)).toThrow();
  });

  it('disabled mode does not load database configuration or open a connection', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(
      await runLifecycleCommand(['--once'], {
        PROJECT_LIFECYCLE_ENABLED: 'false',
        DATABASE_URL: 'not-a-database-url',
      }),
    ).toBe(0);
  });

  it('rejects unknown or repeated flags before executing work', async () => {
    await expect(runLifecycleCommand(['--now=2099'], {})).rejects.toThrow();
    await expect(runLifecycleCommand(['--once', '--once'], {})).rejects.toThrow();
  });

  it('does not overlap transactions and stops after an in-flight pass finishes', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    let finish!: (value: typeof result) => void;
    const pass = vi.fn(
      () =>
        new Promise<typeof result>((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const running = runLifecycleLoop(pass, { once: false, intervalMs: 1000 }, controller.signal);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pass).toHaveBeenCalledTimes(1);
    controller.abort();
    finish(result);
    expect(await running).toBe(0);
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it('returns failure for a failed one-shot without exposing exception details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await runLifecycleLoop(
        async () => {
          throw new Error('private-connection-string');
        },
        { once: true, intervalMs: 1000 },
        new AbortController().signal,
      ),
    ).toBe(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-connection-string');
  });

  it('backs off after a failed pass and can recover without parallel execution', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const controller = new AbortController();
    const pass = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockImplementationOnce(async () => {
        controller.abort();
        return result;
      });
    const running = runLifecycleLoop(pass, { once: false, intervalMs: 10_000 }, controller.signal);
    await vi.advanceTimersByTimeAsync(999);
    expect(pass).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await running).toBe(0);
    expect(pass).toHaveBeenCalledTimes(2);
  });

  it.each(['web', 'lifecycle'])(
    'reaps the sibling when %s exits unexpectedly',
    async (failingName) => {
      const folder = await mkdtemp(path.join(tmpdir(), 'qosyl-lifecycle-'));
      const marker = path.join(folder, 'worker.pid');
      const worker = path.join(folder, 'worker.mjs');
      const web = path.join(folder, 'web.mjs');
      const launcher = path.join(folder, 'supervisor.mjs');
      let supervisor: ReturnType<typeof spawn> | undefined;
      try {
        await writeFile(
          worker,
          `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000);`,
        );
        await writeFile(
          web,
          `import{existsSync}from'node:fs';setInterval(()=>{if(existsSync(${JSON.stringify(marker)}))process.exit(7)},20);setTimeout(()=>process.exit(8),5000);`,
        );
        const moduleUrl = new URL('../scripts/run-platform.mjs', import.meta.url).href;
        await writeFile(
          launcher,
          `import{superviseProcesses}from${JSON.stringify(moduleUrl)};process.exitCode=await superviseProcesses([{name:${JSON.stringify(failingName === 'web' ? 'lifecycle' : 'web')},args:[${JSON.stringify(worker)}]},{name:${JSON.stringify(failingName)},args:[${JSON.stringify(web)}]}],{stdio:'ignore'});`,
        );
        supervisor = spawn(process.execPath, [launcher], { stdio: 'ignore', windowsHide: true });
        const [code] = await once(supervisor, 'exit');
        expect(code).toBe(7);
        const workerPid = Number(await readFile(marker, 'utf8'));
        expect(() => process.kill(workerPid, 0)).toThrow();
      } finally {
        if (supervisor && supervisor.exitCode === null) supervisor.kill('SIGKILL');
        // Only the uniquely-created test directory is recursively removed.
        if (
          !path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep) ||
          !path.basename(folder).startsWith('qosyl-lifecycle-')
        )
          throw new Error('Invalid test cleanup path');
        await rm(folder, { recursive: true, force: true });
      }
    },
    15_000,
  );

  it('does not orphan children after the supervisor is force-terminated', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'qosyl-lifecycle-'));
    const marker = path.join(folder, 'child.pid');
    const childFile = path.join(folder, 'child.mjs');
    const launcher = path.join(folder, 'supervisor.mjs');
    let supervisor: ReturnType<typeof spawn> | undefined;
    let childPid: number | undefined;
    try {
      await writeFile(
        childFile,
        `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000);`,
      );
      const moduleUrl = new URL('../scripts/run-platform.mjs', import.meta.url).href;
      await writeFile(
        launcher,
        `import{superviseProcesses}from${JSON.stringify(moduleUrl)};process.exitCode=await superviseProcesses([{name:'web',args:[${JSON.stringify(childFile)}]}],{stdio:'ignore'});`,
      );
      supervisor = spawn(process.execPath, [launcher], { stdio: 'ignore', windowsHide: true });
      await vi.waitFor(
        async () => {
          childPid = Number(await readFile(marker, 'utf8'));
        },
        { timeout: 5000 },
      );
      supervisor.kill('SIGKILL');
      await once(supervisor, 'exit');
      await vi.waitFor(() => expect(() => process.kill(childPid!, 0)).toThrow(), { timeout: 5000 });
    } finally {
      if (supervisor && supervisor.exitCode === null) supervisor.kill('SIGKILL');
      if (
        !path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep) ||
        !path.basename(folder).startsWith('qosyl-lifecycle-')
      )
        throw new Error('Invalid test cleanup path');
      await rm(folder, { recursive: true, force: true });
    }
  }, 15_000);
});
