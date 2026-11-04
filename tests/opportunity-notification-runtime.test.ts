import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOpportunityNotificationSettings } from '../src/lib/opportunity-notification-settings.mjs';
import {
  runOpportunitySearchCommand,
  runOpportunitySearchLoop,
} from '../scripts/opportunity-search-worker';

// Node's promise timer bypasses Vitest's fake clock; adapt only the waiting boundary.
vi.mock('node:timers/promises', () => ({
  setTimeout: (ms: number, _value: unknown, options?: { signal?: AbortSignal }) =>
    new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      };
      const timer = setTimeout(() => {
        options?.signal?.removeEventListener('abort', abort);
        resolve(undefined);
      }, ms);
      if (options?.signal?.aborted) abort();
      else options?.signal?.addEventListener('abort', abort, { once: true });
    }),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const result = {
  status: 'completed',
  scannedSearches: 2,
  notificationsCreated: 1,
  matchesRecorded: 3,
};

describe('saved-search notification runtime boundaries', () => {
  it('has bounded defaults and accepts the documented boundaries', () => {
    expect(getOpportunityNotificationSettings({})).toEqual({
      enabled: true,
      intervalMs: 60_000,
      batchSize: 10,
    });
    expect(
      getOpportunityNotificationSettings({
        OPPORTUNITY_NOTIFICATIONS_ENABLED: 'false',
        OPPORTUNITY_NOTIFICATIONS_INTERVAL_MS: '1000',
        OPPORTUNITY_NOTIFICATIONS_BATCH_SIZE: '1',
      }),
    ).toEqual({ enabled: false, intervalMs: 1000, batchSize: 1 });
    expect(
      getOpportunityNotificationSettings({
        OPPORTUNITY_NOTIFICATIONS_INTERVAL_MS: '86400000',
        OPPORTUNITY_NOTIFICATIONS_BATCH_SIZE: '20',
      }),
    ).toEqual({ enabled: true, intervalMs: 86_400_000, batchSize: 20 });
  });

  it('rejects ambiguous flags, empty values and unbounded work', () => {
    for (const invalid of [
      { OPPORTUNITY_NOTIFICATIONS_ENABLED: 'yes' },
      { OPPORTUNITY_NOTIFICATIONS_ENABLED: '' },
      { OPPORTUNITY_NOTIFICATIONS_INTERVAL_MS: '999' },
      { OPPORTUNITY_NOTIFICATIONS_INTERVAL_MS: '86400001' },
      { OPPORTUNITY_NOTIFICATIONS_INTERVAL_MS: '1000.5' },
      { OPPORTUNITY_NOTIFICATIONS_INTERVAL_MS: 'NaN' },
      { OPPORTUNITY_NOTIFICATIONS_INTERVAL_MS: '' },
      { OPPORTUNITY_NOTIFICATIONS_BATCH_SIZE: '0' },
      { OPPORTUNITY_NOTIFICATIONS_BATCH_SIZE: '21' },
      { OPPORTUNITY_NOTIFICATIONS_BATCH_SIZE: '' },
    ])
      expect(() => getOpportunityNotificationSettings(invalid)).toThrow();
  });

  it('disabled mode exits without importing database configuration', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(
      await runOpportunitySearchCommand(['--once'], {
        OPPORTUNITY_NOTIFICATIONS_ENABLED: 'false',
        DATABASE_URL: 'not-a-database-url',
      }),
    ).toBe(0);
    expect(log).toHaveBeenCalledWith('opportunity_notifications_disabled');
  });

  it('rejects unknown and repeated CLI flags before work starts', async () => {
    for (const args of [['--now=2099'], ['--batch-size=1000'], ['--once', '--once']])
      await expect(runOpportunitySearchCommand(args, {})).rejects.toThrow();
  });

  it('executes one-shot work once and logs only public counters', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const pass = vi.fn(async () => ({ ...result, privateQuery: 'secret-search' }));
    expect(
      await runOpportunitySearchLoop(
        pass,
        { once: true, intervalMs: 1000 },
        new AbortController().signal,
      ),
    ).toBe(0);
    expect(pass).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('opportunity_notifications_pass', result);
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-search');
  });

  it('does not overlap transactions and completes in-flight work after shutdown', async () => {
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
    const running = runOpportunitySearchLoop(
      pass,
      { once: false, intervalMs: 1000 },
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pass).toHaveBeenCalledTimes(1);
    controller.abort();
    finish(result);
    expect(await running).toBe(0);
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it('does not start a pass when already stopped', async () => {
    const pass = vi.fn(async () => result);
    const controller = new AbortController();
    controller.abort();
    expect(
      await runOpportunitySearchLoop(pass, { once: false, intervalMs: 1000 }, controller.signal),
    ).toBe(0);
    expect(pass).not.toHaveBeenCalled();
  });

  it('returns failure for a failed one-shot without exposing exceptions', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await runOpportunitySearchLoop(
        async () => {
          throw new Error('private-database-password');
        },
        { once: true, intervalMs: 1000 },
        new AbortController().signal,
      ),
    ).toBe(1);
    expect(log).toHaveBeenCalledWith('opportunity_notifications_pass_failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-database-password');
  });

  it('caps error backoff at one minute and recovers sequentially', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const controller = new AbortController();
    const pass = vi.fn(async () => {
      if (pass.mock.calls.length <= 8) throw new Error('temporary');
      controller.abort();
      return result;
    });
    const running = runOpportunitySearchLoop(
      pass,
      { once: false, intervalMs: 1000 },
      controller.signal,
    );
    for (const [index, wait] of [
      1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000,
    ].entries()) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(pass).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(await running).toBe(0);
    expect(pass).toHaveBeenCalledTimes(9);
  });

  it('stops waiting promptly when shutdown is requested', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const controller = new AbortController();
    const pass = vi.fn(async () => result);
    const running = runOpportunitySearchLoop(
      pass,
      { once: false, intervalMs: 86_400_000 },
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    expect(await running).toBe(0);
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it('supervisor reaps the web and lifecycle siblings when the notification worker exits', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'qosyl-notification-runtime-'));
    const markers = [path.join(folder, 'web.pid'), path.join(folder, 'lifecycle.pid')];
    const sibling = path.join(folder, 'sibling.mjs');
    const failing = path.join(folder, 'notifications.mjs');
    const launcher = path.join(folder, 'supervisor.mjs');
    let supervisor: ReturnType<typeof spawn> | undefined;
    try {
      await writeFile(
        sibling,
        `import{writeFileSync}from'node:fs';writeFileSync(process.argv[2],String(process.pid));setInterval(()=>{},1000);`,
      );
      await writeFile(
        failing,
        `import{existsSync}from'node:fs';setInterval(()=>{if(${JSON.stringify(markers)}.every(existsSync))process.exit(7)},20);setTimeout(()=>process.exit(8),5000);`,
      );
      const moduleUrl = new URL('../scripts/run-platform.mjs', import.meta.url).href;
      const commands = [
        { name: 'web', args: [sibling, markers[0]] },
        { name: 'lifecycle', args: [sibling, markers[1]] },
        { name: 'opportunity-notifications', args: [failing] },
      ];
      await writeFile(
        launcher,
        `import{superviseProcesses}from${JSON.stringify(moduleUrl)};process.exitCode=await superviseProcesses(${JSON.stringify(commands)},{stdio:'ignore'});`,
      );
      supervisor = spawn(process.execPath, [launcher], { stdio: 'ignore', windowsHide: true });
      const [code] = await once(supervisor, 'exit');
      expect(code).toBe(7);
      for (const marker of markers) {
        const childPid = Number(await readFile(marker, 'utf8'));
        expect(() => process.kill(childPid, 0)).toThrow();
      }
    } finally {
      if (supervisor && supervisor.exitCode === null) supervisor.kill('SIGKILL');
      if (
        !path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep) ||
        !path.basename(folder).startsWith('qosyl-notification-runtime-')
      )
        throw new Error('Invalid test cleanup path');
      await rm(folder, { recursive: true, force: true });
    }
  }, 15_000);
});
