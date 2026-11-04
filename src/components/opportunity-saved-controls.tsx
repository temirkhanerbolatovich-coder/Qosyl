'use client';
import Link from 'next/link';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import {
  localizedOpportunityCategoryLabels,
  localizedSpecialtyLabels,
} from '@/lib/localized-opportunity-labels';
import type { SavedOpportunityFilters } from '@/lib/opportunity-saved';
import type { OpportunitySavedState } from './opportunity-saved-state';
import { useI18n } from './locale-provider';

export function OpportunitySavedFeedback({ saved }: { saved: OpportunitySavedState }) {
  const { locale, t } = useI18n();
  if (!saved.error)
    return saved.success ? (
      <p className="alert success" role="status" lang={locale}>
        {saved.success}
      </p>
    ) : null;
  return (
    <div className="alert error" role="alert" lang={locale}>
      <div>
        <p>
          {saved.originalError && (
            <span lang="kk">{t('Исходное сообщение: ', 'Бастапқы хабарлама: ')}</span>
          )}
          <span lang={saved.errorLanguage}>{saved.error}</span>
        </p>
        {saved.accessExpired ? (
          <Link href="/auth/login" className="text-link">
            {t('Войти снова', 'Қайта кіру')}
          </Link>
        ) : (
          <button
            type="button"
            className="button secondary"
            disabled={saved.loading || saved.busy}
            onClick={() => void saved.refresh()}
          >
            {t('Повторить загрузку сохранённого', 'Сақталғандарды қайта жүктеу')}
          </button>
        )}
      </div>
    </div>
  );
}
export function OpportunityFavoriteButton({
  itemId,
  saved,
}: {
  itemId: string;
  saved: OpportunitySavedState;
}) {
  const { locale, t } = useI18n();
  const favorite = saved.data?.favorites.find((item) => item.itemId === itemId);
  return (
    <button
      type="button"
      lang={locale}
      className="button secondary"
      aria-pressed={!!favorite}
      disabled={saved.loading || saved.busy || !saved.data || saved.accessExpired}
      onClick={() =>
        void saved.mutate(
          favorite
            ? { action: 'removeFavorite', favoriteId: favorite.id }
            : { action: 'saveFavorite', itemId },
        )
      }
    >
      {favorite ? (
        <BookmarkCheck size={16} aria-hidden="true" />
      ) : (
        <Bookmark size={16} aria-hidden="true" />
      )}
      {favorite
        ? t('Убрать из избранного', 'Таңдаулылардан алып тастау')
        : t('В избранное', 'Таңдаулыларға қосу')}
    </button>
  );
}
export function SaveOpportunitySearch({
  filters,
  saved,
}: {
  filters: SavedOpportunityFilters;
  saved: OpportunitySavedState;
}) {
  const { locale, t } = useI18n();
  const opportunityCategoryLabels = localizedOpportunityCategoryLabels(locale);
  const specialtyLabels = localizedSpecialtyLabels(locale);
  const description =
    [
      filters.q && `«${filters.q}»`,
      filters.category && opportunityCategoryLabels[filters.category],
      filters.specialty && specialtyLabels[filters.specialty],
      filters.geography,
    ]
      .filter(Boolean)
      .join(' · ') || t('Все возможности', 'Барлық мүмкіндік');
  return (
    <form
      lang={locale}
      className="panel stack"
      aria-label={t('Сохранить текущий поиск', 'Ағымдағы іздеуді сақтау')}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const name = String(new FormData(form).get('name') || '');
        if (await saved.mutate({ action: 'saveSearch', name, filters })) form.reset();
      }}
    >
      <p>
        <strong>{t('Сохранить применённые условия:', 'Қолданылған шарттарды сақтау:')}</strong>{' '}
        <span lang="und">{description}</span>
      </p>
      <label className="field">
        {t('Название поиска', 'Іздеу атауы')}
        <input
          name="name"
          maxLength={80}
          required
          placeholder={t('Например, стажировки по медицине', 'Мысалы, медицина тағылымдамалары')}
        />
      </label>
      <div className="button-row">
        <button
          type="submit"
          className="button secondary"
          disabled={saved.loading || saved.busy || !saved.data || saved.accessExpired}
        >
          {t('Сохранить поиск', 'Іздеуді сақтау')}
        </button>
        <Link href="/opportunities/saved" className="text-link">
          {t('Моё избранное и поиски →', 'Менің таңдаулыларым мен іздеулерім →')}
        </Link>
      </div>
      <p className="muted small-text">
        {t(
          'Сохраняются условия последнего поиска. Чтобы сохранить новый ввод выше, сначала нажмите «Найти возможности». До 20 поисков; повтор условий не создаёт дубликат. Уведомления выключены по умолчанию; частота выбирается в сохранённых поисках.',
          'Соңғы іздеудің шарттары сақталады. Жоғарыдағы жаңа мәндерді сақтау үшін алдымен «Мүмкіндіктерді табу» түймесін басыңыз. 20 іздеуге дейін сақтауға болады; бірдей шарттар қайталанбайды. Хабарламалар әдепкіде өшірулі; жиілігі сақталған іздеулерде таңдалады.',
        )}
      </p>
    </form>
  );
}
