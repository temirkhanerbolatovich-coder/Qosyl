'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import type { OpportunityFacets, PublicContentPost } from '@/contracts/content-intake';
import {
  opportunityHours,
  opportunitySort,
  opportunityWindow,
  type OpportunityHours,
  type OpportunitySort,
  type OpportunityWindow,
} from '@/lib/content-validation';
import Link from 'next/link';
import { OpportunityFilters } from './opportunity-filters';
import { OpportunityQuickFilters } from './opportunity-quick-filters';
import {
  localizedOpportunityCategoryLabels,
  localizedOpportunityConditionLabels,
  localizedSpecialtyLabels,
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
import { OpportunityConditions } from './opportunity-conditions';
import {
  OpportunityFavoriteButton,
  OpportunitySavedFeedback,
  SaveOpportunitySearch,
} from './opportunity-saved-controls';

const pageSize = 6;
const resultsAnchor = 'opportunity-results';

export function Opportunities({
  catalogue = false,
  initialPage: page = 1,
  sort = 'newest',
  added,
  deadline,
  hours,
  noExperience,
  initialFilters: appliedFilters = { q: '', geography: '' },
  initialError = '',
}: {
  catalogue?: boolean;
  initialPage?: number;
  sort?: OpportunitySort;
  added?: OpportunityWindow;
  deadline?: OpportunityWindow;
  hours?: OpportunityHours;
  noExperience?: 'true';
  initialFilters?: SavedOpportunityFilters;
  initialError?: string;
}) {
  const { locale, t } = useI18n();
  const opportunityCategoryLabels = localizedOpportunityCategoryLabels(locale);
  const specialtyLabels = localizedSpecialtyLabels(locale);
  const conditionLabels = localizedOpportunityConditionLabels(locale);
  const saved = useOpportunitySaved(catalogue);
  const router = useRouter();
  const [error, setError] = useState<'' | 'unavailable' | 'filters'>('');
  const [posts, setPosts] = useState<PublicContentPost[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<OpportunityFacets>();
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const restoredFocus = useRef(false);
  const query = opportunitySearchUrl(appliedFilters).split('?')[1] ?? '';
  const view = { sort, added, deadline, hours, noExperience };
  const returnTo = catalogue ? opportunitySearchUrl(appliedFilters, { ...view, page }) : '/';
  const lastPage = Math.max(1, Math.min(10000, Math.ceil(total / pageSize)));
  const filterLabels: Record<keyof SavedOpportunityFilters, string | undefined> = {
    q: appliedFilters.q ? t(`Поиск: ${appliedFilters.q}`, `Іздеу: ${appliedFilters.q}`) : undefined,
    category: appliedFilters.category && opportunityCategoryLabels[appliedFilters.category],
    specialty: appliedFilters.specialty && specialtyLabels[appliedFilters.specialty],
    geography: appliedFilters.geography
      ? t(`Регион: ${appliedFilters.geography}`, `Өңір: ${appliedFilters.geography}`)
      : undefined,
    workMode: appliedFilters.workMode && conditionLabels.workMode[appliedFilters.workMode],
    payStatus: appliedFilters.payStatus && conditionLabels.payStatus[appliedFilters.payStatus],
    kazakhstanEligible: appliedFilters.kazakhstanEligible && conditionLabels.kazakhstanEligible,
  };
  // Time, hours and experience slices are views of the catalogue; a saved search does not store them.
  const windowLabels: { key: 'added' | 'deadline' | 'hours' | 'noExperience'; label: string }[] =
    [];
  if (hours)
    windowLabels.push({
      key: 'hours',
      label: t(`Нагрузка: до ${hours} ч в неделю`, `Жүктеме: аптасына ${hours} сағатқа дейін`),
    });
  if (noExperience)
    windowLabels.push({
      key: 'noExperience',
      label: t('Опыт не требуется', 'Тәжірибе қажет емес'),
    });
  if (added)
    windowLabels.push({
      key: 'added',
      label: t(`Добавлено за ${added} дн.`, `Соңғы ${added} күнде қосылған`),
    });
  if (deadline)
    windowLabels.push({
      key: 'deadline',
      label: t(`Срок подачи: до ${deadline} дн.`, `Өтінім мерзімі: ${deadline} күнге дейін`),
    });
  useEffect(() => {
    let active = true;
    let requestNumber = 0;
    let loaded: PublicContentPost[] = [];
    async function refresh() {
      const currentRequest = ++requestNumber;
      try {
        const response = await fetch(
          `/api/content/posts?limit=${pageSize}&page=${page}&sort=${sort}${added ? `&added=${added}` : ''}${deadline ? `&deadline=${deadline}` : ''}${hours ? `&hours=${hours}` : ''}${noExperience ? '&noExperience=true' : ''}${catalogue ? '&facets=true' : ''}${query ? `&${query}` : ''}`,
          {
            cache: 'no-store',
            signal: AbortSignal.timeout(10000),
          },
        );
        const body = await response.json();
        if (
          !response.ok ||
          !Array.isArray(body.data?.posts) ||
          !Number.isSafeInteger(body.data.total) ||
          body.data.total < 0
        ) {
          throw new Error('Unavailable');
        }
        if (active && currentRequest === requestNumber) {
          setError('');
          setTotal(body.data.total);
          setFacets(body.data.facets);
          // The server already excluded expired items, so posts and total share one snapshot.
          loaded = body.data.posts;
          setPosts(loaded);
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
    // A card expiring on screen triggers a reload, so the count and next page stay consistent.
    const expiryTimer = setInterval(() => {
      const current = loaded.filter((post) => new Date(post.expiresAt) > new Date());
      if (current.length === loaded.length) return;
      loaded = current;
      setPosts(current);
      void refresh();
    }, 1000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(expiryTimer);
      window.removeEventListener('focus', refresh);
    };
  }, [catalogue, query, page, retry, sort, added, deadline, hours, noExperience]);

  useEffect(() => {
    if (!catalogue || loading || error || restoredFocus.current) return;
    // The card link stores its anchor in the URL before navigating, so Back restores it too.
    const anchor = window.location.hash.slice(1);
    if (!anchor.startsWith('opportunity-')) return;
    restoredFocus.current = true;
    const target = document.getElementById(anchor);
    const focusTarget = target ?? resultsHeading.current;
    focusTarget?.scrollIntoView({ block: 'start' });
    focusTarget?.focus({ preventScroll: true });
  }, [catalogue, error, loading]);
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
            collapseOnMobile
            facets={facets}
            initialWindows={{ added, deadline, hours, noExperience }}
            initialFilters={appliedFilters}
            onSearch={(value) => {
              let nextUrl: string;
              try {
                const fields = Object.fromEntries(new URLSearchParams(value));
                const windows = {
                  added: opportunityWindow.safeParse(fields.added).data,
                  deadline: opportunityWindow.safeParse(fields.deadline).data,
                  hours: opportunityHours.safeParse(fields.hours).data,
                  noExperience: fields.noExperience === 'true' ? ('true' as const) : undefined,
                };
                for (const key of ['added', 'deadline', 'hours', 'noExperience'])
                  delete fields[key];
                const filters = normalizeOpportunityFilters(fields);
                nextUrl = opportunitySearchUrl(filters, { ...view, ...windows });
              } catch {
                setError('filters');
                setLoading(false);
                return;
              }
              if (nextUrl === returnTo) {
                setLoading(true);
                setError('');
                setRetry((previous) => previous + 1);
                router.replace(nextUrl, { scroll: false });
              } else {
                router.push(nextUrl, { scroll: false });
              }
            }}
          />
        ) : (
          <Link className="text-link" href="/opportunities">
            {t('Все возможности и поиск →', 'Барлық мүмкіндік және іздеу →')}
          </Link>
        )}
        {catalogue && (
          <OpportunityQuickFilters filters={appliedFilters} view={view} facets={facets} />
        )}
        {catalogue && (query || windowLabels.length > 0) && (
          <div className="opportunity-applied-filters">
            <p className="small-text" id="applied-opportunity-filters">
              {t('Применённые фильтры', 'Қолданылған сүзгілер')}
            </p>
            <ul role="list" className="button-row" aria-labelledby="applied-opportunity-filters">
              {Object.entries(filterLabels).map(([key, label]) => {
                if (!label) return null;
                const remaining = { ...appliedFilters };
                delete remaining[key as keyof SavedOpportunityFilters];
                return (
                  <li key={key}>
                    <Link
                      className="button secondary small"
                      href={opportunitySearchUrl(remaining, view)}
                      scroll={false}
                      aria-label={t(`Снять фильтр: ${label}`, `Сүзгіні алып тастау: ${label}`)}
                    >
                      <span>{label}</span>
                      <X size={16} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
              {windowLabels.map(({ key, label }) => (
                <li key={key}>
                  <Link
                    className="button secondary small"
                    href={opportunitySearchUrl(appliedFilters, { ...view, [key]: undefined })}
                    scroll={false}
                    aria-label={t(`Снять фильтр: ${label}`, `Сүзгіні алып тастау: ${label}`)}
                  >
                    <span>{label}</span>
                    <X size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
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
        {catalogue && (
          <div className="opportunity-results-bar">
            <h2 id={resultsAnchor} tabIndex={-1} ref={resultsHeading}>
              {t('Результаты поиска', 'Іздеу нәтижелері')}
            </h2>
            <label className="field opportunity-sort">
              {t('Сортировка', 'Сұрыптау')}
              <select
                value={sort}
                onChange={(event) => {
                  const selected = opportunitySort.parse(event.currentTarget.value);
                  router.push(
                    `${opportunitySearchUrl(appliedFilters, { ...view, sort: selected })}#${resultsAnchor}`,
                    { scroll: false },
                  );
                }}
              >
                <option value="newest">{t('Сначала новые', 'Алдымен жаңалары')}</option>
                {appliedFilters.q && (
                  <option value="relevance">{t('По соответствию', 'Сәйкестік бойынша')}</option>
                )}
                <option value="deadline">
                  {t('Ближайший срок подачи', 'Өтінім берудің ең жақын мерзімі')}
                </option>
              </select>
            </label>
          </div>
        )}
        {loading && <p role="status">{t('Ищем возможности…', 'Мүмкіндіктер ізделуде…')}</p>}
        {catalogue && !loading && !error && (
          <p role="status" className="muted">
            {t(`Найдено: ${total}`, `Табылды: ${total}`)}
          </p>
        )}
        {!loading && error && (
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
        {!catalogue && !loading && !error && !posts.length && (
          <p role="status">
            {t('Сейчас нет актуальных публикаций.', 'Қазір өзекті жарияланымдар жоқ.')}
          </p>
        )}
        {catalogue && !loading && !error && !posts.length && (
          <p>
            {page > lastPage
              ? t('На этой странице больше нет результатов.', 'Бұл бетте нәтиже қалмады.')
              : query
                ? t(
                    'По этим условиям ничего не найдено. Попробуйте снять один из фильтров.',
                    'Бұл шарттарға сәйкес нәтиже табылмады. Бір сүзгіні алып тастап көріңіз.',
                  )
                : t('Сейчас нет актуальных публикаций.', 'Қазір өзекті жарияланымдар жоқ.')}
          </p>
        )}
        {catalogue && !loading && !error && total === 0 && (query || windowLabels.length > 0) && (
          <ul
            role="list"
            className="stack opportunity-relaxed-filters"
            aria-label={t('Что можно изменить', 'Нені өзгертуге болады')}
          >
            {[
              ...Object.entries(filterLabels).map(([key, label]) => {
                const remaining = { ...appliedFilters };
                delete remaining[key as keyof SavedOpportunityFilters];
                return { key, label, href: opportunitySearchUrl(remaining, view) };
              }),
              ...windowLabels.map(({ key, label }) => ({
                key,
                label,
                href: opportunitySearchUrl(appliedFilters, { ...view, [key]: undefined }),
              })),
            ].flatMap(({ key, label, href }) => {
              const found = facets?.relaxed[key];
              if (!label || !found) return [];
              return (
                <li key={key}>
                  <Link className="button secondary" href={href} scroll={false}>
                    {t(
                      `Снять «${label}» · найдётся: ${found}`,
                      `«${label}» алып тастау · табылады: ${found}`,
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className={catalogue ? 'opportunity-list' : 'projects-grid'}>
          {posts.map((post) => (
            <article className="panel stack opportunity-card" key={post.id}>
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
              <OpportunityConditions post={post} />
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
              <Link
                className="button secondary"
                id={catalogue ? `opportunity-${encodeURIComponent(post.id)}` : undefined}
                href={`/opportunities/${encodeURIComponent(post.id)}?from=${encodeURIComponent(returnTo)}`}
                onNavigate={
                  catalogue
                    ? () => {
                        restoredFocus.current = false;
                        window.history.replaceState(
                          window.history.state,
                          '',
                          `${window.location.pathname}${window.location.search}#opportunity-${encodeURIComponent(post.id)}`,
                        );
                      }
                    : undefined
                }
              >
                {t('Подробнее', 'Толығырақ')}
              </Link>
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
              onClick={() =>
                router.push(
                  opportunitySearchUrl(appliedFilters, {
                    ...view,
                    page: error ? page - 1 : Math.min(page - 1, lastPage),
                  }) + `#${resultsAnchor}`,
                  { scroll: false },
                )
              }
            >
              {t('Назад', 'Артқа')}
            </button>
            <span>
              {t('Страница', 'Бет')} {page}
            </span>
            <button
              className="button secondary"
              disabled={loading || Boolean(error) || page >= lastPage}
              onClick={() =>
                router.push(
                  opportunitySearchUrl(appliedFilters, { ...view, page: page + 1 }) +
                    `#${resultsAnchor}`,
                  { scroll: false },
                )
              }
            >
              {t('Далее', 'Келесі')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
