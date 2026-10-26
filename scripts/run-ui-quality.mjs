import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const baseline = args.includes('--baseline');
if (process.env.E2E_EXTERNAL_SERVER || process.env.E2E_BASE_URL)
  throw new Error('UI quality uses only its configured isolated local test server.');
const result = spawnSync(
  process.execPath,
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config=playwright.ui.config.ts',
    ...args.filter((arg) => arg !== '--baseline'),
  ],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, UI_QUALITY_BASELINE: baseline ? 'true' : 'false' },
  },
);
if (result.error) throw result.error;
const summary = spawnSync(
  process.execPath,
  ['scripts/summarize-ui-quality.mjs', ...(baseline ? ['--baseline'] : [])],
  {
    stdio: 'inherit',
    windowsHide: true,
  },
);
if (summary.error) throw summary.error;
if (summary.status !== 0 && result.status === 0) process.exit(summary.status ?? 1);
process.exitCode = result.status ?? 1;
