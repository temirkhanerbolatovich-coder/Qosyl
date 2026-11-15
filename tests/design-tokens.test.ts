import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import tokens from '../src/lib/design-tokens.json';
import {
  ELEVATION_LEVELS,
  TYPOGRAPHY_ROLES,
  elevationProblems,
  sizeRangePx,
  typographyProblems,
} from '../scripts/design-token-rules.mjs';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const css = readFileSync('src/app/design-tokens.css', 'utf8');

describe('typography and elevation tokens', () => {
  it('accept the shipped values', () => {
    expect(typographyProblems(tokens.typography)).toEqual([]);
    expect(elevationProblems(tokens.elevation)).toEqual([]);
  });

  it('define every role and level, largest first', () => {
    expect(Object.keys(tokens.typography)).toEqual(TYPOGRAPHY_ROLES);
    expect(Object.keys(tokens.elevation)).toEqual(ELEVATION_LEVELS);
  });

  it('keep the sizes that were already shipped for headings and body text', () => {
    expect(sizeRangePx(tokens.typography.h1.size)).toEqual({ min: 32, max: 44 });
    expect(sizeRangePx(tokens.typography.h2.size)).toEqual({ min: 24, max: 32 });
    expect(sizeRangePx(tokens.typography.h3.size)).toEqual({ min: 22, max: 22 });
    expect(sizeRangePx(tokens.typography.h4.size)).toEqual({ min: 18, max: 18 });
    expect(sizeRangePx(tokens.typography.body.size)).toEqual({ min: 16, max: 16 });
    expect(sizeRangePx(tokens.typography.caption.size)).toEqual({ min: 12, max: 12 });
  });

  it('generate a variable for every role field and level, and a class for each role and surface', () => {
    for (const role of TYPOGRAPHY_ROLES) {
      for (const field of ['size', 'line', 'weight', 'tracking']) {
        expect(css).toContain(`--text-${role}-${field}:`);
      }
      expect(css).toContain(`.text-${role} {`);
    }
    for (const level of ELEVATION_LEVELS) expect(css).toContain(`--elevation-${level}:`);
    for (const level of ['flat', 'raised', 'overlay']) expect(css).toContain(`.surface-${level} {`);
    expect(css).toContain('.text-numeric {');
  });
});

describe('typography rules reject broken tokens', () => {
  it('rejects a missing section, a missing role and an unknown role', () => {
    expect(typographyProblems(undefined)).toEqual(['typography section is missing']);
    const missing = clone(tokens.typography) as Record<string, unknown>;
    delete missing.caption;
    expect(typographyProblems(missing)).toContain('caption: role is missing');
    const extra = { ...clone(tokens.typography), huge: clone(tokens.typography.h1) };
    expect(typographyProblems(extra)).toContain('unknown typography roles: huge');
  });

  it('rejects body text below 16px and any text below 12px', () => {
    const small = clone(tokens.typography);
    small.body.size = '0.9375rem';
    expect(typographyProblems(small)).toContain('body: must be at least 16px');
    const tiny = clone(tokens.typography);
    tiny.caption.size = '0.6875rem';
    expect(typographyProblems(tiny)).toContain('caption: must be at least 12px');
  });

  it('rejects a role that is larger than the one above it', () => {
    const bad = clone(tokens.typography);
    bad.h3.size = '2.5rem';
    expect(typographyProblems(bad)).toContain('h3: must not be larger than h2');
  });

  it('rejects unsupported size expressions and an inverted clamp', () => {
    const bad = clone(tokens.typography);
    bad.h1.size = '32px';
    expect(typographyProblems(bad)).toContain(
      'h1: size must be N rem or clamp(N rem, N vw, N rem)',
    );
    const inverted = clone(tokens.typography);
    inverted.h2.size = 'clamp(2rem, 3vw, 1.5rem)';
    expect(typographyProblems(inverted)).toContain('h2: clamp minimum exceeds its maximum');
  });

  it('rejects line heights, weights and tracking outside the allowed ranges', () => {
    const bad = clone(tokens.typography);
    bad.h1.line = 1.6;
    bad.body.line = 1.2;
    bad.h2.weight = 900;
    bad.h3.tracking = '-0.2em';
    const problems = typographyProblems(bad);
    expect(problems).toContain('h1: heading line height must not exceed 1.35');
    expect(problems).toContain('body: text line height must be at least 1.4');
    expect(problems).toContain('h2: weight must be an integer from 400 to 800');
    expect(problems).toContain('h3: tracking must be an em value from -0.05em to 0.1em');
  });
});

describe('elevation rules reject broken tokens', () => {
  it('rejects a flat level that casts a shadow', () => {
    const bad = { ...tokens.elevation, flat: '0 1px 2px var(--shadow-color)' };
    expect(elevationProblems(bad)).toContain('flat: must be none');
  });

  it('rejects hard-coded colours and malformed layers', () => {
    const bad = { ...tokens.elevation, raised: '0 4px 12px rgba(0, 0, 0, 0.1)' };
    expect(elevationProblems(bad)).toContain(
      'raised: each layer must be "0 Ypx Bpx var(--shadow-color)"',
    );
  });

  it('rejects an overlay that is not blurrier than the raised level', () => {
    const bad = { ...tokens.elevation, overlay: '0 2px 4px var(--shadow-color)' };
    expect(elevationProblems(bad)).toContain('overlay: must be blurrier than raised');
  });

  it('rejects a missing section and a missing level', () => {
    expect(elevationProblems(null)).toEqual(['elevation section is missing']);
    expect(elevationProblems({ flat: 'none', raised: tokens.elevation.raised })).toContain(
      'overlay: level is missing',
    );
  });
});
