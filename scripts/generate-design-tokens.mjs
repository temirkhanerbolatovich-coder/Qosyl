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
${Object.entries(tokens.motion.durationMs)
  .map(([name, value]) => `  --motion-${name}: ${value}ms;`)
  .join('\n')}
${Object.entries(tokens.motion.easing)
  .map(([name, value]) => `  --ease-${name}: ${value};`)
  .join('\n')}
${Object.entries(tokens.typography)
  .map(
    ([role, token]) =>
      `  --text-${role}-size: ${token.size};
  --text-${role}-line: ${token.line};
  --text-${role}-weight: ${token.weight};
  --text-${role}-tracking: ${token.tracking};`,
  )
  .join('\n')}
${Object.entries(tokens.elevation)
  .map(([level, value]) => `  --elevation-${level}: ${value};`)
  .join('\n')}
  --duration: var(--motion-base);
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
/* One class per text role and per surface level, so a component never sets a size by hand. */
${Object.entries(tokens.typography)
  .map(
    ([role, token]) => `.text-${role} {${
      token.family === 'heading'
        ? '\n  font-family: var(--font-manrope), var(--font-inter), sans-serif;'
        : ''
    }
  font-size: var(--text-${role}-size);
  line-height: var(--text-${role}-line);
  font-weight: var(--text-${role}-weight);
  letter-spacing: var(--text-${role}-tracking);
}`,
  )
  .join('\n')}
.text-numeric {
  font-variant-numeric: tabular-nums;
}
.surface-flat {
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--elevation-flat);
}
.surface-raised {
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--elevation-raised);
}
.surface-overlay {
  background: var(--surface);
  border: 0;
  box-shadow: var(--elevation-overlay);
}
`;
const file = 'src/app/design-tokens.css';
if (process.argv.includes('--check')) {
  if ((await readFile(file, 'utf8')) !== css)
    throw new Error('Design token CSS is stale; run npm run ui:tokens.');
} else await writeFile(file, css);
