'use client';

import { marketplaceCopy, marketplaceCopyKk } from '@/lib/marketplace-copy';
import { useI18n } from './locale-provider';
import { kazakhValidationMessage } from '@/lib/validation-feedback';

export function useMarketplaceCopy() {
  const { locale } = useI18n();
  return { locale, copy: (text: string) => marketplaceCopy(text, locale) };
}

/** Small client leaves let server-rendered public content react to language changes. */
export function MarketplaceText({ text }: { text: string }) {
  const { locale, copy } = useMarketplaceCopy();
  return <span lang={locale}>{copy(text)}</span>;
}

export function MarketplaceWeeklyHours({ hours }: { hours: number }) {
  const { locale } = useMarketplaceCopy();
  return (
    <span lang={locale}>
      {locale === 'kk' ? `Аптасына ${hours} сағатқа дейін` : `До ${hours} ч в неделю`}
    </span>
  );
}

export function MarketplaceSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  const { locale } = useMarketplaceCopy();
  return (
    <div className={className} lang={locale}>
      {children}
    </div>
  );
}

export function MarketplaceDate({ value, timeZone }: { value: string; timeZone: string }) {
  const { locale } = useMarketplaceCopy();
  const formatter = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-KZ', {
    timeZone,
    day: locale === 'kk' ? '2-digit' : 'numeric',
    month: locale === 'kk' ? '2-digit' : 'long',
    year: 'numeric',
  });
  const parsed = new Date(value);
  const parts = Object.fromEntries(
    formatter.formatToParts(parsed).map((part) => [part.type, part.value]),
  );
  const text =
    locale === 'kk' ? `${parts.day}.${parts.month}.${parts.year}` : formatter.format(parsed);
  return (
    <time dateTime={value} lang={locale}>
      {text}
    </time>
  );
}

/** Translate known local feedback at render time; preserve unknown service details. */
export function MarketplaceMessage({ text }: { text: string }) {
  const { locale, copy } = useMarketplaceCopy();
  const known = Object.hasOwn(marketplaceCopyKk, text);
  const validation = locale === 'kk' && !known ? kazakhValidationMessage(text) : null;
  return (
    <span lang={known || validation ? locale : 'und'}>
      {!known && !validation && locale === 'kk' && <span lang="kk">Бастапқы хабарлама: </span>}
      {validation ?? copy(text)}
    </span>
  );
}
