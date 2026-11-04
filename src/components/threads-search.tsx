'use client';
import { useMarketplaceCopy } from './marketplace-copy';
import { useEffect, useState } from 'react';
import {
  threadsSearchDataSchema,
  threadsStatusDataSchema,
  type ThreadsCandidate,
} from '@/lib/threads-search';
import { CheckCircle2 } from 'lucide-react';
import { ActionFeedback } from './platform';

export function ThreadsSearch({ onChoose }: { onChoose: (item: ThreadsCandidate) => void }) {
  const { locale, copy } = useMarketplaceCopy();
  const [available, setAvailable] = useState(false),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ThreadsCandidate[]>([]),
    [error, setError] = useState(''),
    [success, setSuccess] = useState<{ found: number; discarded: number } | null>(null);
  useEffect(() => {
    let active = true;
    void fetch('/api/admin/leads/threads', {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
      .catch(() => {
        throw new Error('Не удалось проверить подключение Threads.');
      })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            typeof body?.error === 'string' ? body.error : 'Не удалось проверить подключение.',
          );
        const parsed = threadsStatusDataSchema.safeParse(body?.data);
        if (!parsed.success)
          throw new Error('Ответ сервера не подтверждает состояние подключения Threads.');
        const status = parsed.data;
        if (active) {
          setAvailable(status.enabled && status.configured);
          setChecked(true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setError(
            error instanceof Error ? error.message : 'Не удалось проверить подключение Threads.',
          );
          setChecked(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section lang={locale} className="panel stack" aria-label={copy('Поиск в Threads')}>
      <h3>{copy('Поиск в Threads')}</h3>
      <p>
        {copy(
          'Найдите публикации по теме. Выбранный текст заполнит пустую форму ниже; сохранение и проверку выполняете вы.',
        )}
      </p>
      <p className="notice">
        {copy(
          'До одобрения приложения в Meta поиск доступен только по публикациям подключённого аккаунта. Пустой результат не означает отсутствия публичных запросов по этой теме.',
        )}
      </p>
      {checked && !available && (
        <p className="notice">
          {copy(
            'Подключение ещё не настроено или выключено. Инструкция для администратора: docs/threads-search.md.',
          )}
        </p>
      )}
      <form
        className="stack"
        aria-label={copy('Поисковый запрос Threads')}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !available) return;
          const query = String(new FormData(event.currentTarget).get('query') ?? '');
          setBusy(true);
          setError('');
          setSuccess(null);
          setItems([]);
          try {
            const response = await fetch('/api/admin/leads/threads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query }),
              cache: 'no-store',
              signal: AbortSignal.timeout(20000),
            }).catch(() => {
              throw new Error('Threads временно недоступен. Повторите поиск позже.');
            });
            const body = await response.json().catch(() => null);
            if (!response.ok)
              throw new Error(
                typeof body?.error === 'string' ? body.error : 'Не удалось выполнить поиск.',
              );
            const parsed = threadsSearchDataSchema.safeParse(body?.data);
            if (!parsed.success)
              throw new Error('Threads вернул неподдерживаемый ответ. Результат не сохранён.');
            const result = parsed.data;
            setItems(result.items);
            setSuccess({ found: result.items.length, discarded: result.discarded });
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Ошибка поиска.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          {copy('Тема или ключевые слова')}{' '}
          <input
            name="query"
            required
            minLength={2}
            maxLength={100}
            disabled={!available || busy}
          />
        </label>
        <button className="button secondary" disabled={!available || busy}>
          {busy ? copy('Ищем…') : copy('Найти публикации')}
        </button>
      </form>
      <ActionFeedback error={error} />
      {success && (
        <div className="alert success" role="status">
          <CheckCircle2 size={18} />
          <span>
            {locale === 'kk'
              ? `Табылған үміткерлер: ${success.found}. Алынып тасталғаны: ${success.discarded}. Бұл барлық жарияланымдар емес, шектеулі іріктеме.`
              : `Найдено кандидатов: ${success.found}. Отброшено: ${success.discarded}. Это ограниченная выборка, а не все публикации.`}
          </span>
        </div>
      )}
      {items.map((item) => (
        <article className="summary-card stack" key={item.externalId}>
          <strong>
            <span lang="und">{item.sourceName}</span>
          </strong>
          <p>
            <span lang="und">{item.summary}</span>
          </p>
          <p className="muted">
            {copy('Дата публикации:')}{' '}
            {new Date(item.publishedAt).toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU')}
          </p>
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
            {copy('Оригинал')}
          </a>
          <button className="button secondary" onClick={() => onChoose(item)}>
            {copy('Заполнить пустую форму кандидата')}
          </button>
        </article>
      ))}
    </section>
  );
}
