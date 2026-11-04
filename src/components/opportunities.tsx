'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicContentPost } from '@/contracts/content-intake';
import Link from 'next/link';
import { OpportunityFilters } from './opportunity-filters';
import {
  localizedOpportunityCategoryLabels,
  opportunityContentLanguage,
} from '@/lib/localized-opportunity-labels';
import { date } from '@/lib/labels';
import { useI18n } from './locale-provider';
import {
  normalizeOpportunityFilters,
  opportunitySearchUrl,
  type SavedOpportunityFilters,
} from '@/lib/opportunity-saved';
import { useOpportunitySaved } from './opportunity-saved-state';
import {
  OpportunityFavoriteButton,
  OpportunitySavedFeedback,
  SaveOpportunitySearch,
} from './opportunity-saved-controls';

export function Opportunities({
  catalogue = false,
  initialFilters = { q: '', geography: '' },
  initialError = '',
}: {
  catalogue?: boolean;
  initialFilters?: SavedOpportunityFilters;
  initialError?: string;
}) {
  const { locale, t } = useI18n();
  const opportunityCategoryLabels = localizedOpportunityCategoryLabels(locale);
  const saved = useOpportunitySaved(catalogue);
  const router = useRouter();
  const [query, setQuery] = useState(
      () => opportunitySearchUrl(initialFilters).split('?')[1] ?? '',
    ),
    [page, setPage] = useState(1),
    [error, setError] = useState<'' | 'unavailable' | 'filters'>('');
  const [posts, setPosts] = useState<PublicContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const appliedFilters = normalizeOpportunityFilters(
    Object.fromEntries(new URLSearchParams(query)),
  );
  useEffect(() => {
    let active = true;
    let requestNumber = 0;
    async function refresh() {
      const currentRequest = ++requestNumber;
      try {
        const response = await fetch(
          `/api/content/posts?limit=6&page=${page}${query ? `&${query}` : ''}`,
          {
            cache: 'no-store',
            signal: AbortSignal.timeout(10000),
          },
        );
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.data?.posts)) throw new Error('Unavailable');
        if (active && currentRequest === requestNumber) {
          setError('');
          setPosts(
            body.data.posts.filter(
              (post: PublicContentPost) => new Date(post.expiresAt) > new Date(),
            ),
          );
        }
      } catch {
        if (active && currentRequest === requestNumber) {
          setPosts([]);
          setError('unavailable');
        }
      } finally {
        if (active && currentRequest === requestNumber) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    const expiryTimer = setInterval(
      () =>
        setPosts((previous) => {
          const current = previous.filter((post) => new Date(post.expiresAt) > new Date());
          return current.length === previous.length ? previous : current;
        }),
      1000,
    );
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(expiryTimer);
      window.removeEventListener('focus', refresh);
    };
  }, [query, page, retry]);
  if (!catalogue && !posts.length) return null;
  return (
    <section
      lang={locale}
      className={`home-section opportunities-section${catalogue ? ' opportunities-catalogue' : ''}`}
      aria-label={t('Возможности и события', 'Мүмкіндіктер мен іс-шаралар')}
    >
      <div className="container stack">
        {!catalogue && (
          <div className="section-title">
            <div>
              <h2>{t('Возможности и события', 'Мүмкіндіктер мен іс-шаралар')}</h2>
            </div>
          </div>
        )}
        <p className="muted">
          {t(
            'Проверенные редактором ссылки на внешние события. Условия участия уточняйте у организатора.',
            'Редактор тексерген сыртқы іс-шараларға сілтемелер. Қатысу шарттарын ұйымдастырушыдан нақтылаңыз.',
          )}
        </p>
        {catalogue ? (
          <OpportunityFilters
            initialFilters={initialFilters}
            onSearch={(value) => {
              let nextQuery: string;
              let nextUrl: string;
              try {
                const filters = normalizeOpportunityFilters(
                  Object.fromEntries(new URLSearchParams(value)),
                );
                nextUrl = opportunitySearchUrl(filters);
                nextQuery = nextUrl.split('?')[1] ?? '';
              } catch {
                setError('filters');
                setLoading(false);
                return;
              }
              setLoading(true);
              setError('');
              setQuery(nextQuery);
              setPage(1);
              setPosts([]);
              setRetry((previous) => previous + 1);
              router.replace(nextUrl, { scroll: false });
            }}
          />
        ) : (
          <Link className="text-link" href="/opportunities">
            {t('Все возможности и поиск →', 'Барлық мүмкіндік және іздеу →')}
          </Link>
        )}
        {catalogue && initialError && (
          <p className="alert" role="status">
            {t(
              initialError,
              'Сілтемедегі сүзгілер дұрыс емес. Барлық мүмкіндік көрсетілді; іздеу шарттарын қайта енгізіңіз.',
            )}
          </p>
        )}
        {catalogue &&
          (saved.signedIn ? (
            <>
              <OpportunitySavedFeedback saved={saved} />
              {saved.loading && (
                <p role="status">
                  {t('Загрузка избранного и поисков…', 'Таңдаулылар мен іздеулер жүктелуде…')}
                </p>
              )}
              <SaveOpportunitySearch saved={saved} filters={appliedFilters} />
            </>
          ) : (
            <p>
              <Link className="text-link" href="/auth/login">
                {t(
                  'Войдите, чтобы сохранять возможности и поиски',
                  'Мүмкіндіктер мен іздеулерді сақтау үшін кіріңіз',
                )}
              </Link>
            </p>
          ))}
        {catalogue && loading && (
          <p role="status">{t('Ищем возможности…', 'Мүмкіндіктер ізделуде…')}</p>
        )}
        {catalogue && !loading && error && (
          <div className="alert error" role="alert">
            <div>
              <p>
                {error === 'filters'
                  ? t(
                      'Проверьте условия поиска и повторите попытку.',
                      'Іздеу шарттарын тексеріп, қайталап көріңіз.',
                    )
                  : t(
                      'Не удалось загрузить возможности. Повторите позже.',
                      'Мүмкіндіктерді жүктеу мүмкін болмады. Кейінірек қайталап көріңіз.',
                    )}
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  setLoading(true);
                  setError('');
                  setRetry((previous) => previous + 1);
                }}
              >
                {t('Повторить загрузку', 'Қайта жүктеу')}
              </button>
            </div>
          </div>
        )}
        {catalogue && !loading && !error && !posts.length && (
          <p>
            {t(
              'Опубликованных материалов по запросу пока нет. Новые находки сначала проверяет администратор.',
              'Сұрауыңыз бойынша жарияланған материал әзірше жоқ. Жаңа материалдарды алдымен әкімші тексереді.',
            )}
          </p>
        )}
        <div className="projects-grid">
          {posts.map((post) => (
            <article className="panel stack" key={post.id}>
              <span className="muted small-text">
                {opportunityCategoryLabels[post.category]} ·{' '}
                <span lang={opportunityContentLanguage(post.language)}>{post.sourceName}</span>
              </span>
              <h3 lang={opportunityContentLanguage(post.language)}>{post.title}</h3>
              <p className="muted small-text">
                {post.publishedAt
                  ? t(
                      `Опубликовано ${date(post.publishedAt, false, locale)}`,
                      `Жарияланған күні: ${date(post.publishedAt, false, locale)}`,
                    )
                  : t('Дата публикации не указана.', 'Жарияланған күні көрсетілмеген.')}
              </p>
              <p lang={opportunityContentLanguage(post.language)}>{post.summary}</p>
              {post.geography && (
                <p className="small-text" lang={opportunityContentLanguage(post.language)}>
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
              {post.eventDate && (
                <p className="small-text">
                  {t('Событие:', 'Іс-шара:')} {date(post.eventDate, true, locale)}
                </p>
              )}
              <a className="text-link" href={post.url} target="_blank" rel="noopener noreferrer">
                {t('К организатору →', 'Ұйымдастырушыға өту →')}
              </a>
              {catalogue && saved.signedIn && (
                <OpportunityFavoriteButton itemId={post.id} saved={saved} />
              )}
            </article>
          ))}
        </div>
        {catalogue && (
          <div className="button-row">
            <button
              className="button secondary"
              disabled={loading || page <= 1}
              onClick={() => {
                setLoading(true);
                setError('');
                setPosts([]);
                setPage(page - 1);
              }}
            >
              {t('Назад', 'Артқа')}
            </button>
            <span>
              {t('Страница', 'Бет')} {page}
            </span>
            <button
              className="button secondary"
              disabled={loading || posts.length < 6}
              onClick={() => {
                setLoading(true);
                setError('');
                setPosts([]);
                setPage(page + 1);
              }}
            >
              {t('Далее', 'Келесі')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
