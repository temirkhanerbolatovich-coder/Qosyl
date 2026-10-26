'use client';
import { useEffect, useState } from 'react';
import type { PublicContentPost } from '@/contracts/content-intake';
import Link from 'next/link';
import { OpportunityFilters } from './opportunity-filters';
import { opportunityCategoryLabels } from '@/lib/opportunity-search';
import { date } from '@/lib/labels';

export function Opportunities({ catalogue = false }: { catalogue?: boolean }) {
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [error, setError] = useState('');
  const [posts, setPosts] = useState<PublicContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
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
          setError('Не удалось загрузить возможности. Повторите позже.');
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
      className={`home-section opportunities-section${catalogue ? ' opportunities-catalogue' : ''}`}
      aria-label="Возможности и события"
    >
      <div className="container stack">
        {!catalogue && (
          <div className="section-title">
            <div>
              <h2>Возможности и события</h2>
            </div>
          </div>
        )}
        <p className="muted">
          Проверенные редактором ссылки на внешние события. Условия участия уточняйте у
          организатора.
        </p>
        {catalogue ? (
          <OpportunityFilters
            onSearch={(value) => {
              setLoading(true);
              setError('');
              setQuery(value);
              setPage(1);
              setPosts([]);
              setRetry((previous) => previous + 1);
            }}
          />
        ) : (
          <Link className="text-link" href="/opportunities">
            Все возможности и поиск →
          </Link>
        )}
        {catalogue && loading && <p role="status">Ищем возможности…</p>}
        {catalogue && !loading && error && (
          <div className="alert error" role="alert">
            <div>
              <p>{error}</p>
              <button
                className="button secondary"
                onClick={() => {
                  setLoading(true);
                  setError('');
                  setRetry((previous) => previous + 1);
                }}
              >
                Повторить загрузку
              </button>
            </div>
          </div>
        )}
        {catalogue && !loading && !error && !posts.length && (
          <p>
            Опубликованных материалов по запросу пока нет. Новые находки сначала проверяет
            администратор.
          </p>
        )}
        <div className="projects-grid">
          {posts.map((post) => (
            <article className="panel stack" key={post.id}>
              <span className="muted small-text">
                {opportunityCategoryLabels[post.category]} · {post.sourceName}
              </span>
              <h3>{post.title}</h3>
              <p className="muted small-text">
                {post.publishedAt
                  ? `Опубликовано ${date(post.publishedAt)}`
                  : 'Дата публикации не указана.'}
              </p>
              <p>{post.summary}</p>
              {post.geography && <p className="small-text">{post.geography}</p>}
              <p className="small-text">
                {post.deadline
                  ? `Приём заявок до ${date(post.deadline, true)}`
                  : 'Срок подачи уточняйте у организатора.'}
              </p>
              {post.eventDate && (
                <p className="small-text">Событие: {date(post.eventDate, true)}</p>
              )}
              <a className="text-link" href={post.url} target="_blank" rel="noopener noreferrer">
                К организатору →
              </a>
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
              Назад
            </button>
            <span>Страница {page}</span>
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
              Далее
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
