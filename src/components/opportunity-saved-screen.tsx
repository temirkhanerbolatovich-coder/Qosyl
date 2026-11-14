'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { opportunitySearchUrl } from '@/lib/opportunity-saved';
import { date } from '@/lib/labels';
import {
  localizedOpportunityCategoryLabels,
  localizedOpportunityConditionLabels,
  localizedSpecialtyLabels,
  opportunityContentLanguage,
} from '@/lib/localized-opportunity-labels';
import { useOpportunitySaved } from './opportunity-saved-state';
import { OpportunityFavoriteButton, OpportunitySavedFeedback } from './opportunity-saved-controls';
import { OpportunitySearchNotificationControls } from './opportunity-search-notification-controls';
import { useI18n } from './locale-provider';
import { OpportunityConditions } from './opportunity-conditions';
import { OpportunityDeadlineReminder } from './opportunity-deadline-reminder';
import { OpportunityFavoriteNote } from './opportunity-favorite-note';
import { OpportunityCompare } from './opportunity-compare';
import { LoadingNote } from './state-note';

export function OpportunitySavedScreen() {
  const { locale, t } = useI18n();
  const opportunityCategoryLabels = localizedOpportunityCategoryLabels(locale);
  const specialtyLabels = localizedSpecialtyLabels(locale);
  const conditionLabels = localizedOpportunityConditionLabels(locale);
  const saved = useOpportunitySaved();
  const [now, setNow] = useState(() => Date.now());
  const [typeFilter, setTypeFilter] = useState('');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  // Types present among the currently available favorites, with how many each has.
  const typeCounts = new Map<string, number>();
  for (const favorite of saved.data?.favorites ?? [])
    if (favorite.post && new Date(favorite.post.expiresAt).getTime() > now)
      typeCounts.set(favorite.post.category, (typeCounts.get(favorite.post.category) ?? 0) + 1);
  const categoriesInFavorites = [...typeCounts.entries()];
  // Up to three available favorites of one type can be compared; removed ones drop out silently.
  const compared = compareIds.flatMap((itemId) => {
    const post = (saved.data?.favorites ?? []).find((favorite) => favorite.itemId === itemId)?.post;
    return post && new Date(post.expiresAt).getTime() > now ? [post] : [];
  });
  const compareCategory = compared[0]?.category;
  // A type whose last favorite was removed or expired falls back to showing everything.
  const shownType = typeCounts.has(typeFilter) ? typeFilter : '';
  return (
    <div className="container page-shell stack" lang={locale}>
      <div className="button-row">
        <h1>{t('Избранное и сохранённые поиски', 'Таңдаулылар мен сақталған іздеулер')}</h1>
        <Link className="button secondary" href="/opportunities">
          {t('К поиску возможностей', 'Мүмкіндіктерді іздеуге өту')}
        </Link>
      </div>
      <p className="muted">
        {t(
          'Ваш список доступен только в вашем аккаунте. Сохранение не регистрирует вас на мероприятие; условия и подача остаются у организатора.',
          'Тізім тек өз аккаунтыңызда қолжетімді. Сақтау іс-шараға тіркемейді; шарттар мен өтінім беру ұйымдастырушыда қалады.',
        )}
      </p>
      <OpportunitySavedFeedback saved={saved} />
      {saved.loading && (
        <LoadingNote>
          {t('Загрузка избранного и поисков…', 'Таңдаулылар мен іздеулер жүктелуде…')}
        </LoadingNote>
      )}
      {saved.data && (
        <>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              disabled={saved.loading || saved.busy}
              onClick={() => void saved.refresh()}
            >
              {t('Обновить сохранённое', 'Сақталғандарды жаңарту')}
            </button>
          </div>
          <section
            className="stack"
            aria-label={t('Избранные возможности', 'Таңдаулы мүмкіндіктер')}
          >
            <h2>{t('Избранные возможности', 'Таңдаулы мүмкіндіктер')}</h2>
            <p className="muted small-text">
              {t(
                'До 100 материалов. Истёкшая или снятая с публикации возможность остаётся в списке как недоступная — её можно убрать.',
                '100 материалға дейін. Мерзімі өткен немесе жариялаудан алынған мүмкіндік тізімде қолжетімсіз болып қалады — оны алып тастауға болады.',
              )}
            </p>
            {!saved.data.favorites.length && (
              <p>
                {t(
                  'В избранном пока пусто. Найдите возможность и нажмите «В избранное».',
                  'Таңдаулылар әзірше бос. Мүмкіндікті тауып, «Таңдаулыларға қосу» түймесін басыңыз.',
                )}
              </p>
            )}
            {categoriesInFavorites.length > 1 && (
              <label className="field opportunity-sort">
                {t('Показать тип', 'Түрі бойынша көрсету')}
                <select value={shownType} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="">{t('Все типы', 'Барлық түрі')}</option>
                  {categoriesInFavorites.map(([category, count]) => (
                    <option key={category} value={category}>
                      {opportunityCategoryLabels[category]} ({count})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {compareIds.length === 0 ? (
              <p className="muted small-text">
                {t(
                  'Чтобы сравнить, отметьте от 2 до 3 возможностей одного типа.',
                  'Салыстыру үшін бір түрдегі 2–3 мүмкіндікті белгілеңіз.',
                )}
              </p>
            ) : (
              <div className="compare-bar" role="group" aria-label={t('Сравнение', 'Салыстыру')}>
                <span>
                  {t(`Выбрано: ${compared.length} из 3`, `Таңдалды: ${compared.length} / 3`)}
                </span>
                <button
                  type="button"
                  className="button small"
                  disabled={compared.length < 2}
                  aria-expanded={showCompare && compared.length >= 2}
                  aria-controls="opportunity-compare"
                  onClick={() => setShowCompare(true)}
                >
                  {t(`Сравнить (${compared.length})`, `Салыстыру (${compared.length})`)}
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => {
                    setCompareIds([]);
                    setShowCompare(false);
                  }}
                >
                  {t('Снять выбор', 'Таңдауды алу')}
                </button>
              </div>
            )}
            {showCompare && compared.length >= 2 && (
              <OpportunityCompare
                posts={compared}
                onClose={() => {
                  setCompareIds([]);
                  setShowCompare(false);
                }}
              />
            )}
            <div className="projects-grid">
              {saved.data.favorites.map((favorite) => {
                const post =
                  favorite.post && new Date(favorite.post.expiresAt).getTime() > now
                    ? favorite.post
                    : null;
                // Unavailable placeholders have no type, so they belong to "all types" only.
                if (shownType && post?.category !== shownType) return null;
                return (
                  <article className="panel stack opportunity-card" key={favorite.id}>
                    {post ? (
                      <>
                        <span className="muted small-text">
                          {opportunityCategoryLabels[post.category]} ·{' '}
                          <span lang={opportunityContentLanguage(post.language)}>
                            {post.sourceName}
                          </span>
                        </span>
                        <h3 lang={opportunityContentLanguage(post.language)}>{post.title}</h3>
                        <p lang={opportunityContentLanguage(post.language)}>{post.summary}</p>
                        {post.geography && (
                          <p
                            className="small-text"
                            lang={opportunityContentLanguage(post.language)}
                          >
                            {post.geography}
                          </p>
                        )}
                        <OpportunityConditions post={post} compact />
                        <p className="small-text">
                          {post.deadline
                            ? t(
                                `Приём заявок до ${date(post.deadline, true, locale)}`,
                                `Өтінім қабылдау мерзімі: ${date(post.deadline, true, locale)}`,
                              )
                            : t(
                                'Срок подачи уточняйте у организатора.',
                                'Өтінім беру мерзімін ұйымдастырушыдан нақтылаңыз.',
                              )}
                        </p>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={compareIds.includes(favorite.itemId)}
                            disabled={
                              !compareIds.includes(favorite.itemId) &&
                              (compared.length >= 3 ||
                                (compareCategory !== undefined &&
                                  post.category !== compareCategory))
                            }
                            onChange={(event) =>
                              setCompareIds((current) =>
                                event.target.checked
                                  ? [...current, favorite.itemId]
                                  : current.filter((itemId) => itemId !== favorite.itemId),
                              )
                            }
                          />
                          {t('Сравнить', 'Салыстыру')}
                        </label>
                        <Link
                          className="button secondary"
                          href={`/opportunities/${encodeURIComponent(post.id)}?from=${encodeURIComponent('/opportunities/saved')}`}
                        >
                          {t('Подробнее', 'Толығырақ')}
                        </Link>
                        <a
                          className="text-link"
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('К организатору →', 'Ұйымдастырушыға өту →')}
                        </a>
                      </>
                    ) : (
                      <>
                        <h3>{t('Материал недоступен', 'Материал қолжетімсіз')}</h3>
                        <p>
                          {t(
                            'Срок актуальности истёк или публикация больше не доступна. Проверьте новые предложения в каталоге.',
                            'Өзектілік мерзімі аяқталды немесе жарияланым енді қолжетімсіз. Каталогтағы жаңа ұсыныстарды қараңыз.',
                          )}
                        </p>
                      </>
                    )}
                    {/* Note and reminder stay one tap away; the summary says what is already set. */}
                    <details className="favorite-extras">
                      <summary>
                        {t('Заметка и напоминание', 'Жазба және еске салу')}
                        {(favorite.note || favorite.reminderDaysBefore) && (
                          <span className="muted small-text">
                            {' · '}
                            {[
                              favorite.note && t('есть заметка', 'жазба бар'),
                              favorite.reminderDaysBefore &&
                                t(
                                  `напоминание за ${favorite.reminderDaysBefore} дн.`,
                                  `${favorite.reminderDaysBefore} күн бұрын еске салу`,
                                ),
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        )}
                      </summary>
                      <div className="stack">
                        {post?.deadline && new Date(post.deadline).getTime() > now && (
                          <OpportunityDeadlineReminder
                            favoriteId={favorite.id}
                            current={favorite.reminderDaysBefore}
                            saved={saved}
                          />
                        )}
                        <OpportunityFavoriteNote
                          favoriteId={favorite.id}
                          current={favorite.note}
                          saved={saved}
                        />
                      </div>
                    </details>
                    <OpportunityFavoriteButton itemId={favorite.itemId} saved={saved} compact />
                  </article>
                );
              })}
            </div>
          </section>
          <section className="stack" aria-label={t('Сохранённые поиски', 'Сақталған іздеулер')}>
            <h2>{t('Сохранённые поиски', 'Сақталған іздеулер')}</h2>
            <p className="muted small-text">
              {t(
                'До 20 наборов условий. Открытие поиска показывает актуальную выдачу. Уведомления выключены по умолчанию; частоту можно выбрать для каждого поиска. Письма, Telegram и push-уведомления не отправляются.',
                '20 шарт жиынтығына дейін. Іздеуді ашқанда өзекті нәтижелер көрсетіледі. Хабарламалар әдепкіде өшірулі; әр іздеу үшін жиілігін таңдауға болады. Электрондық хаттар, Telegram және push-хабарламалар жіберілмейді.',
              )}
            </p>
            <Link className="text-link" href="/dashboard">
              {t('Уведомления в кабинете →', 'Кабинеттегі хабарламалар →')}
            </Link>
            {!saved.data.searches.length && (
              <p>
                {t(
                  'Сохранённых поисков пока нет. Примените фильтры в каталоге и сохраните поиск под понятным названием.',
                  'Сақталған іздеулер әзірше жоқ. Каталогта сүзгілерді қолданып, іздеуді түсінікті атаумен сақтаңыз.',
                )}
              </p>
            )}
            <div className="stack">
              {saved.data.searches.map((search) => {
                const criteria =
                  [
                    search.filters.q && `«${search.filters.q}»`,
                    search.filters.category && opportunityCategoryLabels[search.filters.category],
                    search.filters.specialty && specialtyLabels[search.filters.specialty],
                    search.filters.geography,
                    search.filters.workMode && conditionLabels.workMode[search.filters.workMode],
                    search.filters.payStatus && conditionLabels.payStatus[search.filters.payStatus],
                    search.filters.kazakhstanEligible && conditionLabels.kazakhstanEligible,
                  ]
                    .filter(Boolean)
                    .join(' · ') || t('Все возможности', 'Барлық мүмкіндік');
                return (
                  <article className="panel stack" key={search.id}>
                    <h3 lang="und">{search.name}</h3>
                    <p lang="und">{criteria}</p>
                    <OpportunitySearchNotificationControls search={search} saved={saved} />
                    <div className="button-row">
                      <Link
                        href={opportunitySearchUrl(search.filters)}
                        className="button secondary"
                      >
                        {t('Открыть поиск', 'Іздеуді ашу')}
                      </Link>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={saved.loading || saved.busy || saved.accessExpired}
                        onClick={() =>
                          void saved.mutate({ action: 'removeSearch', searchId: search.id })
                        }
                      >
                        {t('Удалить поиск', 'Іздеуді жою')}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
