'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { LeadHandoff } from '@/contracts/leads';
import { date } from '@/lib/labels';
export function LeadHandoffsPanel() {
  const [leads, setLeads] = useState<LeadHandoff[]>([]),
    [error, setError] = useState(''),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const [refreshNumber, setRefreshNumber] = useState(0);
  useEffect(() => {
    let active = true;
    function refresh() {
      void fetch(`/api/leads?page=${page}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'Не удалось получить передачи.');
          return body.data;
        })
        .then((data) => {
          if (active) {
            setLeads(data.leads);
            setTotal(data.total);
            setError('');
          }
        })
        .catch((e: unknown) => {
          if (active) setError(e instanceof Error ? e.message : 'Ошибка чтения.');
        });
    }
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [page, refreshNumber]);
  if (!leads.length && !error && page === 1) return null;
  return (
    <section className="panel stack" aria-label="Переданные бизнес-запросы">
      <h2>Переданные бизнес-запросы</h2>
      <button className="button secondary" onClick={() => setRefreshNumber((value) => value + 1)}>
        Обновить передачи
      </button>
      <p>
        Создавайте заказ только если это ваша задача и вы согласовали её размещение. Бюджет,
        результат и критерии вы указываете самостоятельно; публикация проходит модерацию.
      </p>
      {error && <p role="alert">{error}</p>}
      {leads.map((lead) => (
        <article className="panel stack" key={lead.id}>
          <h3>{lead.title}</h3>
          <p>{lead.summary}</p>
          <p className="muted small-text">
            {lead.sourceName} · срок передачи до {date(lead.expiresAt, true)}
          </p>
          <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer">
            Исходный материал
          </a>
          <Link
            className="button secondary"
            href={
              lead.projectId
                ? `/projects/${lead.projectId}`
                : `/client/projects/new?leadId=${lead.id}`
            }
          >
            {lead.projectId ? 'Открыть созданный заказ' : 'Проверить и создать черновик'}
          </Link>
        </article>
      ))}
      <div className="button-row">
        <button
          className="button secondary"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Предыдущие передачи
        </button>
        <span>Страница {page}</span>
        <button
          className="button secondary"
          disabled={page * 20 >= total}
          onClick={() => setPage(page + 1)}
        >
          Следующие передачи
        </button>
      </div>
    </section>
  );
}
