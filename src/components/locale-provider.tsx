'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  localeCookieAssignment,
  localeFromCookieHeader,
  parseLocale,
  type Locale,
} from '@/lib/locale';

type I18n = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (ru: string, kk: string) => string;
  persistenceError: boolean;
};
const LocaleContext = createContext<I18n>({
  locale: 'ru',
  setLocale: () => {},
  t: (ru) => ru,
  persistenceError: false,
});

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const [persistenceError, setPersistenceError] = useState(false);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((value: Locale) => {
    const next = parseLocale(value);
    let persisted = false;
    try {
      document.cookie = localeCookieAssignment(next, location.protocol === 'https:');
      persisted = localeFromCookieHeader(document.cookie) === next;
    } catch {
      /* In-memory language still works when cookies are unavailable. */
    }
    setPersistenceError(!persisted);
    document.documentElement.lang = next;
    updateLocale(next);
  }, []);
  const value = useMemo<I18n>(
    () => ({ locale, setLocale, persistenceError, t: (ru, kk) => (locale === 'kk' ? kk : ru) }),
    [locale, setLocale, persistenceError],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export const useI18n = () => useContext(LocaleContext);

export function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="theme-switch locale-switch" lang={locale}>
      <span>{t('Язык', 'Тіл')}</span>
      <select
        aria-label={t('Язык интерфейса', 'Интерфейс тілі')}
        value={locale}
        onChange={(event) => setLocale(parseLocale(event.target.value))}
      >
        <option value="ru" lang="ru">
          Русский
        </option>
        <option value="kk" lang="kk">
          Қазақша (ішінара)
        </option>
      </select>
    </label>
  );
}
