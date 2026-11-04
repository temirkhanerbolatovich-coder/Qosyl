export const locales = ['ru', 'kk'] as const;
export type Locale = (typeof locales)[number];
export const localeCookieName = 'qosyl-locale';
export const localeCookieMaxAge = 365 * 24 * 60 * 60;
export const parseLocale = (value: unknown): Locale => (value === 'kk' ? 'kk' : 'ru');

/** The cookie contains only a display preference, never account identity or permission. */
export function localeFromCookieHeader(header: string): Locale | null {
  const value = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(localeCookieName + '='))
    ?.slice(localeCookieName.length + 1);
  return value === 'ru' || value === 'kk' ? value : null;
}
export function localeCookieAssignment(value: unknown, secure: boolean) {
  return `${localeCookieName}=${parseLocale(value)}; Path=/; Max-Age=${localeCookieMaxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
}
