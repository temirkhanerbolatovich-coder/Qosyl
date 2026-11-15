/**
 * Where to send a person after sign-in or sign-up. The value arrives in a URL, so it is untrusted:
 * only a path inside this site is accepted, never a full address, a protocol-relative address or a
 * path that browsers would read as one.
 */
export const DEFAULT_NEXT = '/dashboard';

const MAX_LENGTH = 512;
const PROBE_ORIGIN = 'http://qosyl.invalid';

/** Returns a same-site path (with query and hash) or null when the value must not be followed. */
export function parseNext(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_LENGTH) return null;
  // Control characters, spaces and backslashes are read differently by browsers; refuse them.
  if (/[\u0000- \u007f-\u009f\\]/.test(value)) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('://')) return null;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  // Parsing collapses "/.//host" and "/a/..//host" into "//host", which a browser would read as
  // another site. Check the path as it will actually be used, and as it looks once decoded.
  if (url.pathname.startsWith('//')) return null;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (/[\u0000-\u001f\u007f-\u009f\\]/.test(decodedPath) || decodedPath.startsWith('//')) {
    return null;
  }
  // Sending a person back to a sign-in page or a raw API address would be a loop or a dead end.
  if (/^\/(auth|api)(\/|$)/.test(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

/** The safe path, or the fallback when the value is missing or not allowed. */
export function safeNext(value: unknown, fallback: string = DEFAULT_NEXT): string {
  return parseNext(value) ?? fallback;
}

/** The role that makes sense to preselect for a page the person was heading to. */
export function roleForNext(next: string | null | undefined): 'student' | 'client' | null {
  if (!next) return null;
  if (next === '/client' || next.startsWith('/client/')) return 'client';
  if (next === '/projects' || next.startsWith('/projects/')) return 'student';
  return null;
}

/** An auth page address that remembers where the person was going. */
export function authPath(page: '/auth/login' | '/auth/register', next: string | null | undefined) {
  const safe = parseNext(next);
  return safe ? `${page}?next=${encodeURIComponent(safe)}` : page;
}

/** The onboarding address that continues to the remembered page after the profile is saved. */
export function onboardingPath(next: string | null | undefined) {
  const safe = parseNext(next);
  if (!safe) return '/onboarding';
  const role = roleForNext(safe);
  const query = new URLSearchParams();
  if (role) query.set('role', role);
  query.set('next', safe);
  return `/onboarding?${query}`;
}
