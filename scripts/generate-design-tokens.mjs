import { readFile, writeFile } from 'node:fs/promises';
const tokens = JSON.parse(await readFile('src/lib/design-tokens.json', 'utf8'));
function declarations(theme) {
  return Object.entries(theme)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join('\n');
}
const css = `/* Generated from src/lib/design-tokens.json. Run npm run ui:tokens after changes. */
:root {
  color-scheme: light;
${declarations(tokens.themes.light)}
${tokens.spacePx.map((value) => `  --space-${value}: ${value}px;`).join('\n')}
${Object.entries(tokens.radiusPx)
  .map(([name, value]) => `  --radius-${name}: ${value}px;`)
  .join('\n')}
  --content-width: ${tokens.contentMaxWidthPx}px;
  --duration: 180ms;
  --bg: var(--background);
  --paper: var(--surface);
  --ink: var(--text-primary);
  --muted: var(--text-secondary);
  --line: var(--border);
  --blue: var(--action);
  --blue-dark: var(--action-hover);
  --blue-soft: var(--action-background);
  --mint: var(--success-background);
  --green: var(--success);
  --amber: var(--warning-background);
  --radius: var(--radius-large);
  --shadow: 0 4px 16px var(--shadow-color);
}
:root[data-theme='dark'] {
  color-scheme: dark;
${declarations(tokens.themes.dark)}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
${declarations(tokens.themes.dark)}
  }
}
`;
const file = 'src/app/design-tokens.css';
if (process.argv.includes('--check')) {
  if ((await readFile(file, 'utf8')) !== css)
    throw new Error('Design token CSS is stale; run npm run ui:tokens.');
} else await writeFile(file, css);
