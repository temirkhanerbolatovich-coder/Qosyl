import { localeFromCookieHeader, type Locale } from './locale';

type AuthMailKind = 'reset' | 'verification';

/** Preference belongs to this request; absent or unsupported values fall back to Russian. */
export function authMailLocale(request?: Request): Locale {
  return localeFromCookieHeader(request?.headers.get('cookie') ?? '') ?? 'ru';
}

export function authMailCopy(kind: AuthMailKind, locale: Locale, productName: string, url: string) {
  if (kind === 'reset') {
    return locale === 'kk'
      ? {
          subject: `${productName} — қолжетімділікті қалпына келтіру`,
          text: `Құпиясөзді өзгерту сілтемесі 30 минут жарамды: ${url}\nЕгер бұл хатты сұрамаған болсаңыз, оны елемеңіз.`,
        }
      : {
          subject: `${productName} — восстановление доступа`,
          text: `Ссылка для смены пароля действует 30 минут: ${url}\nЕсли вы не запрашивали письмо, проигнорируйте его.`,
        };
  }
  return locale === 'kk'
    ? {
        subject: `${productName} — email мекенжайын растау`,
        text: `Email мекенжайын мына сілтеме арқылы растаңыз: ${url}\nСілтеме бір сағат жарамды.`,
      }
    : {
        subject: `${productName} — подтверждение email`,
        text: `Подтвердите email по ссылке: ${url}\nСсылка действует один час.`,
      };
}
