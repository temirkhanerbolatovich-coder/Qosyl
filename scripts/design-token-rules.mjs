// Rules for the non-colour design tokens. Shared by the token check and its unit test.

/** Roles from the largest to the smallest; the order is part of the contract. */
export const TYPOGRAPHY_ROLES = [
  'display',
  'h1',
  'h2',
  'h3',
  'h4',
  'body-lg',
  'body',
  'body-sm',
  'caption',
];
export const ELEVATION_LEVELS = ['flat', 'raised', 'overlay'];

const REM = /^(\d+(?:\.\d+)?)rem$/;
const CLAMP = /^clamp\(\s*(\d+(?:\.\d+)?)rem,\s*(\d+(?:\.\d+)?)vw,\s*(\d+(?:\.\d+)?)rem\s*\)$/;

/** Smallest and largest size in px that a role can take, or null for an unsupported expression. */
export function sizeRangePx(size) {
  const fixed = REM.exec(size);
  if (fixed) return { min: Number(fixed[1]) * 16, max: Number(fixed[1]) * 16 };
  const fluid = CLAMP.exec(size);
  if (fluid) return { min: Number(fluid[1]) * 16, max: Number(fluid[3]) * 16 };
  return null;
}

export function typographyProblems(typography) {
  const problems = [];
  if (!typography || typeof typography !== 'object') return ['typography section is missing'];
  const unknown = Object.keys(typography).filter((role) => !TYPOGRAPHY_ROLES.includes(role));
  if (unknown.length) problems.push(`unknown typography roles: ${unknown.join(', ')}`);
  let previous = null;
  for (const role of TYPOGRAPHY_ROLES) {
    const token = typography[role];
    if (!token) {
      problems.push(`${role}: role is missing`);
      continue;
    }
    if (!['heading', 'body'].includes(token.family))
      problems.push(`${role}: family must be heading or body`);
    const range = sizeRangePx(token.size);
    if (!range) {
      problems.push(`${role}: size must be N rem or clamp(N rem, N vw, N rem)`);
    } else {
      if (range.min > range.max) problems.push(`${role}: clamp minimum exceeds its maximum`);
      if (role === 'body' && range.min < 16) problems.push('body: must be at least 16px');
      if (range.min < 12) problems.push(`${role}: must be at least 12px`);
      if (previous && (range.min > previous.range.min || range.max > previous.range.max))
        problems.push(`${role}: must not be larger than ${previous.role}`);
      previous = { role, range };
    }
    const isHeading = token.family === 'heading';
    if (typeof token.line !== 'number' || token.line < 1.05 || token.line > 1.7)
      problems.push(`${role}: line height must be between 1.05 and 1.7`);
    else if (isHeading && token.line > 1.35)
      problems.push(`${role}: heading line height must not exceed 1.35`);
    else if (!isHeading && token.line < 1.4)
      problems.push(`${role}: text line height must be at least 1.4`);
    if (!Number.isInteger(token.weight) || token.weight < 400 || token.weight > 800)
      problems.push(`${role}: weight must be an integer from 400 to 800`);
    const tracking = /^(-?\d*\.?\d+)em$/.exec(token.tracking ?? '');
    if (!tracking || Number(tracking[1]) < -0.05 || Number(tracking[1]) > 0.1)
      problems.push(`${role}: tracking must be an em value from -0.05em to 0.1em`);
  }
  return problems;
}

const LAYER = /^0 (-?\d+)px (\d+)px var\(--shadow-color\)$/;

function blur(shadow) {
  return Math.max(...shadow.split(', ').map((layer) => Number(LAYER.exec(layer)?.[2] ?? NaN)));
}

export function elevationProblems(elevation) {
  const problems = [];
  if (!elevation || typeof elevation !== 'object') return ['elevation section is missing'];
  const unknown = Object.keys(elevation).filter((level) => !ELEVATION_LEVELS.includes(level));
  if (unknown.length) problems.push(`unknown elevation levels: ${unknown.join(', ')}`);
  for (const level of ELEVATION_LEVELS) {
    if (typeof elevation[level] !== 'string') problems.push(`${level}: level is missing`);
  }
  if (problems.length) return problems;
  if (elevation.flat !== 'none') problems.push('flat: must be none');
  for (const level of ['raised', 'overlay']) {
    const layers = elevation[level].split(', ');
    if (layers.some((layer) => !LAYER.test(layer)))
      problems.push(`${level}: each layer must be "0 Ypx Bpx var(--shadow-color)"`);
  }
  if (!problems.length && blur(elevation.raised) >= blur(elevation.overlay))
    problems.push('overlay: must be blurrier than raised');
  return problems;
}
