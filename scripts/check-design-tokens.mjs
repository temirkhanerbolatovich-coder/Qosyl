import { readFile, mkdir, writeFile } from 'node:fs/promises';

const tokens = JSON.parse(await readFile('src/lib/design-tokens.json', 'utf8'));
function luminance(hex) {
  if (!/^#[a-f\d]{6}$/i.test(hex)) throw new Error('Expected a six-digit RGB token.');
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
const pairs = [
  ['text-primary', 'surface', 4.5],
  ['text-secondary', 'surface', 4.5],
  ['text-secondary', 'background', 4.5],
  ['text-secondary', 'surface-elevated', 4.5],
  ['action', 'surface', 4.5],
  ['action-text', 'surface', 4.5],
  ['action-text', 'background', 4.5],
  ['action-text', 'action-background', 4.5],
  ['action-foreground', 'action', 4.5],
  ['action-foreground', 'action-hover', 4.5],
  ['control-border', 'surface', 3],
  ['focus', 'surface', 3],
  ...['success', 'warning', 'error', 'info'].flatMap((status) => [
    [status, `${status}-background`, 4.5],
    [status, `${status}-hover`, 4.5],
  ]),
];
const results = Object.entries(tokens.themes).flatMap(([theme, colors]) =>
  pairs.map(([foreground, background, minimum]) => {
    const pair = { theme, foreground, background, minimum };
    const first = luminance(colors[foreground]);
    const second = luminance(colors[background]);
    const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    return { ...pair, ratio: Number(ratio.toFixed(3)), passed: ratio >= pair.minimum };
  }),
);
await mkdir('outputs/ui-quality', { recursive: true });
await writeFile(
  'outputs/ui-quality/token-contrast.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2) + '\n',
);
console.table(results);
if (results.some((result) => !result.passed)) process.exitCode = 1;
