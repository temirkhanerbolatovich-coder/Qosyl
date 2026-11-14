'use client';
import Link from 'next/link';
import { Bell, BellOff, Bookmark, BookmarkCheck } from 'lucide-react';
import {
  localizedOpportunityCategoryLabels,
  localizedOpportunityConditionLabels,
  localizedSpecialtyLabels,
} from '@/lib/localized-opportunity-labels';
import { opportunitySearchKey, type SavedOpportunityFilters } from '@/lib/opportunity-saved';
import type { OpportunitySavedState } from './opportunity-saved-state';
import { useI18n } from './locale-provider';

export function OpportunitySavedFeedback({ saved }: { saved: OpportunitySavedState }) {
  const { locale, t } = useI18n();
  // Confirmations are toasts; only errors stay inline, next to the action that failed.
  if (!saved.error) return null;
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
  compact = false,
}: {
  itemId: string;
  saved: OpportunitySavedState;
  /** A smaller button for card rows; the label stays, it is only sized down. */
  compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const favorite = saved.data?.favorites.find((item) => item.itemId === itemId);
  return (
    <button
      type="button"
      lang={locale}
      className={`button secondary${compact ? ' small' : ''}`}
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
/** The applied conditions as one readable line; also the default name of a saved search. */
function useFilterDescription(filters: SavedOpportunityFilters) {
  const { locale, t } = useI18n();
  const opportunityCategoryLabels = localizedOpportunityCategoryLabels(locale);
  const specialtyLabels = localizedSpecialtyLabels(locale);
  const conditionLabels = localizedOpportunityConditionLabels(locale);
  return (
    [
      filters.q && `«${filters.q}»`,
      filters.category && opportunityCategoryLabels[filters.category],
      filters.specialty && specialtyLabels[filters.specialty],
      filters.geography,
      filters.workMode && conditionLabels.workMode[filters.workMode],
      filters.payStatus && conditionLabels.payStatus[filters.payStatus],
      filters.kazakhstanEligible && conditionLabels.kazakhstanEligible,
    ]
      .filter(Boolean)
      .join(' · ') || t('Все возможности', 'Барлық мүмкіндік')
  );
}

/**
 * "Follow this search": one press saves the applied conditions and turns notifications on
 * (daily); pressing again stops following. Fine tuning stays in the saved searches.
 */
export function FollowOpportunitySearch({
  filters,
  saved,
}: {
  filters: SavedOpportunityFilters;
  saved: OpportunitySavedState;
}) {
  const { locale, t } = useI18n();
  const name = useFilterDescription(filters).slice(0, 80);
  const key = opportunitySearchKey(filters);
  const followed = saved.data?.searches.find(
    (search) =>
      search.notificationFrequency !== 'off' && opportunitySearchKey(search.filters) === key,
  );
  const disabled = saved.loading || saved.busy || !saved.data || saved.accessExpired;
  return (
    <button
      type="button"
      lang={locale}
      className="button secondary small"
      aria-pressed={!!followed}
      disabled={disabled}
      onClick={() =>
        void saved.mutate(
          followed
            ? { action: 'removeSearch', searchId: followed.id }
            : { action: 'saveSearch', name, filters, frequency: 'daily' },
        )
      }
    >
      {followed ? <BellOff size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
      {followed
        ? t('Не следить за поиском', 'Іздеуді қадағаламау')
        : t('Следить за этим поиском', 'Осы іздеуді қадағалау')}
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
  const description = useFilterDescription(filters);
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
