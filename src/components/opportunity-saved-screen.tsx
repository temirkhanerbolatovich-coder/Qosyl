'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { opportunitySearchUrl } from '@/lib/opportunity-saved';
import { date } from '@/lib/labels';
import {
  localizedOpportunityCategoryLabels,
  localizedSpecialtyLabels,
  opportunityContentLanguage,
} from '@/lib/localized-opportunity-labels';
import { useOpportunitySaved } from './opportunity-saved-state';
import { OpportunityFavoriteButton, OpportunitySavedFeedback } from './opportunity-saved-controls';
import { OpportunitySearchNotificationControls } from './opportunity-search-notification-controls';
import { useI18n } from './locale-provider';

export function OpportunitySavedScreen() {
  const { locale, t } = useI18n();
  const opportunityCategoryLabels = localizedOpportunityCategoryLabels(locale);
  const specialtyLabels = localizedSpecialtyLabels(locale);
  const saved = useOpportunitySaved();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
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
        <p role="status">
          {t('Загрузка избранного и поисков…', 'Таңдаулылар мен іздеулер жүктелуде…')}
        </p>
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
            <div className="projects-grid">
              {saved.data.favorites.map((favorite) => {
                const post =
                  favorite.post && new Date(favorite.post.expiresAt).getTime() > now
                    ? favorite.post
                    : null;
                return (
                  <article className="panel stack" key={favorite.id}>
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
                    <OpportunityFavoriteButton itemId={favorite.itemId} saved={saved} />
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
