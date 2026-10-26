'use client';
import { useEffect, useState } from 'react';
import {
  threadsSearchDataSchema,
  threadsStatusDataSchema,
  type ThreadsCandidate,
} from '@/lib/threads-search';
import { ActionFeedback } from './platform';

export function ThreadsSearch({ onChoose }: { onChoose: (item: ThreadsCandidate) => void }) {
  const [available, setAvailable] = useState(false),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ThreadsCandidate[]>([]),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  useEffect(() => {
    let active = true;
    void fetch('/api/admin/leads/threads', {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Не удалось проверить подключение.');
        const status = threadsStatusDataSchema.parse(body.data);
        if (active) {
          setAvailable(status.enabled && status.configured);
          setChecked(true);
        }
      })
      .catch(() => {
        if (active) {
          setError('Не удалось проверить подключение Threads.');
          setChecked(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel stack" aria-label="Поиск в Threads">
      <h3>Поиск в Threads</h3>
      <p>
        Найдите публикации по теме. Выбранный текст заполнит пустую форму ниже; сохранение и
        проверку выполняете вы.
      </p>
      <p className="notice">
        До одобрения приложения в Meta поиск доступен только по публикациям подключённого
        аккаунта. Пустой результат не означает отсутствия публичных запросов по этой теме.
      </p>
      {checked && !available && (
        <p className="notice">
          Подключение ещё не настроено или выключено. Инструкция для администратора:
          docs/threads-search.md.
        </p>
      )}
      <form
        className="stack"
        aria-label="Поисковый запрос Threads"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !available) return;
          const query = String(new FormData(event.currentTarget).get('query') ?? '');
          setBusy(true);
          setError('');
          setSuccess('');
          setItems([]);
          try {
            const response = await fetch('/api/admin/leads/threads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query }),
              cache: 'no-store',
              signal: AbortSignal.timeout(20000),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || 'Не удалось выполнить поиск.');
            const result = threadsSearchDataSchema.parse(body.data);
            setItems(result.items);
            setSuccess(
              `Найдено кандидатов: ${result.items.length}. Отброшено: ${result.discarded}. Это ограниченная выборка, а не все публикации.`,
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Ошибка поиска.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Тема или ключевые слова
          <input
            name="query"
            required
            minLength={2}
            maxLength={100}
            disabled={!available || busy}
          />
        </label>
        <button className="button secondary" disabled={!available || busy}>
          {busy ? 'Ищем…' : 'Найти публикации'}
        </button>
      </form>
      <ActionFeedback error={error} success={success} />
      {items.map((item) => (
        <article className="summary-card stack" key={item.externalId}>
          <strong>{item.sourceName}</strong>
          <p>{item.summary}</p>
          <p className="muted">
            Дата публикации: {new Date(item.publishedAt).toLocaleString('ru-RU')}
          </p>
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
            Оригинал
          </a>
          <button className="button secondary" onClick={() => onChoose(item)}>
            Заполнить пустую форму кандидата
          </button>
        </article>
      ))}
    </section>
  );
}
