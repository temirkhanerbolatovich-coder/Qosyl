import type { Locale } from './locale';
import { moduleErrorsKk } from './module-errors-kk';
import { marketplaceErrorsKk } from './marketplace-errors-kk';

const savedServerErrors = [
  'Аккаунт недоступен.',
  'Войдите в аккаунт.',
  'Сохранённый поиск недоступен.',
  'Возможность недоступна. Обновите каталог.',
  'Можно сохранить до 100 возможностей. Удалите ненужное из избранного.',
  'Можно сохранить до 20 поисков. Удалите ненужный поиск.',
  'Сервер временно недоступен. Попробуйте позже.',
] as const;

/** Translate exact allowlisted server messages; never infer a language for unknown details. */
export function savedServerFeedback(text: string, locale: Locale) {
  const known = savedServerErrors.includes(text as (typeof savedServerErrors)[number]);
  const translation = moduleErrorsKk[text] ?? marketplaceErrorsKk[text];
  return {
    text: locale === 'kk' && known && translation ? translation : text,
    language: known ? locale : ('und' as const),
    original: locale === 'kk' && !known && Boolean(text),
  };
}
