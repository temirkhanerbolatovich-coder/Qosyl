'use client';
import { useEffect, useState } from 'react';
import type { ContentDetailData } from '@/contracts/content-intake';
import { date } from '@/lib/labels';
import { ActionFeedback } from './platform';

async function readDetail(id: string, page: number): Promise<ContentDetailData> {
  const response = await fetch(`/api/admin/content/${encodeURIComponent(id)}?page=${page}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Не удалось прочитать материал.');
  return body.data;
}
const localDate = (value: string) => {
  const time = new Date(value);
  return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const isoDate = (value: FormDataEntryValue | null) =>
  value ? new Date(String(value)).toISOString() : null;

export function ContentEditor({
  id,
  onSaved,
  onClose,
}: {
  id: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [defaultExpiry] = useState(() =>
    localDate(new Date(Date.now() + 7 * 86400000).toISOString()),
  );
  const [detail, setDetail] = useState<ContentDetailData | null>(null),
    [page, setPage] = useState(1);
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(''),
    [right, setRight] = useState('');
  useEffect(() => {
    let active = true;
    void readDetail(id, page)
      .then((data) => {
        if (active) {
          setDetail(data);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Ошибка чтения.');
      });
    return () => {
      active = false;
    };
  }, [id, page]);
  async function save(action: string, fields: Record<string, unknown>) {
    if (!detail || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          action,
          ...fields,
          itemId: id,
          expectedRevisionId: detail.item.revisions[0].id,
          expectedUpdatedAt: detail.item.updatedAt,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Не удалось сохранить решение.');
      setDetail(await readDetail(id, page));
      await onSaved();
      setSuccess('Сохранено. Решение записано в журнал.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения.');
    } finally {
      setBusy(false);
    }
  }
  if (!detail)
    return (
      <section className="panel stack" aria-label="Редакционная проверка">
        <p>{error || 'Загрузка материала…'}</p>
        <button className="button secondary" onClick={onClose}>
          Закрыть проверку
        </button>
      </section>
    );
  const latest = detail.item.revisions[0];
  const first = detail.history.find((revision) => revision.id === left) ?? detail.history[0];
  const second =
    detail.history.find((revision) => revision.id === right) ?? detail.history[1] ?? first;
  const terminal = ['rejected', 'archived', 'withdrawn'].includes(detail.item.status);
  return (
    <section className="panel stack content-editor" aria-label="Редакционная проверка">
      <div className="button-row">
        <h3>Редакционная проверка</h3>
        <button className="button secondary" onClick={onClose}>
          Закрыть проверку
        </button>
      </div>
      <p>
        <strong>{latest?.title}</strong> · {detail.item.status} · редакция {latest?.number}
      </p>
      <p>
        Источник: {detail.source.name}. {detail.source.rightsNote}
      </p>
      {detail.source.termsUrl && (
        <a href={detail.source.termsUrl} target="_blank" rel="noopener noreferrer">
          Условия источника
        </a>
      )}
      <p>
        Одобренная редакция:{' '}
        {detail.item.approvedRevisionId
          ? `№ ${detail.history.find((rev) => rev.id === detail.item.approvedRevisionId)?.number ?? 'в истории'}`
          : 'пока нет'}
        . Актуальна до: {detail.item.expiresAt ? date(detail.item.expiresAt, true) : 'не задано'}.
      </p>
      <p>
        Проверьте оригинал, аудиторию, даты и право на публикацию. Релевантность правилам не
        подтверждает достоверность. Изменение текста снимает материал с выдачи до нового решения.
      </p>
      <ActionFeedback error={error} success={success} />
      <form
        className="stack"
        aria-label="Решение по материалу"
        key={`review-${detail.item.updatedAt}`}
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          const decision = String(values.get('decision'));
          void save('reviewContent', {
            decision,
            reason: values.get('reason'),
            ...(decision === 'publish' ? { expiresAt: isoDate(values.get('expiresAt')) } : {}),
          });
        }}
      >
        <label className="field">
          Решение
          <select
            name="decision"
            defaultValue={
              terminal ? 'reopen' : detail.item.status === 'published' ? 'archive' : 'publish'
            }
          >
            {!terminal && detail.item.status !== 'published' && (
              <option value="publish">Опубликовать проверенную редакцию</option>
            )}
            {!terminal && <option value="reject">Отклонить</option>}
            {detail.item.status !== 'archived' && <option value="archive">В архив</option>}
            {detail.item.status !== 'withdrawn' && <option value="withdraw">Отозвать</option>}
            {terminal && <option value="reopen">Вернуть на проверку</option>}
          </select>
        </label>
        <label className="field">
          Актуально до (для публикации, максимум 90 дней)
          <input name="expiresAt" type="datetime-local" defaultValue={defaultExpiry} />
        </label>
        <p className="small-text muted">
          Более ранние срок подачи или дата события ограничат этот срок. Неизвестный дедлайн не
          выдумывается.
        </p>
        <label className="field">
          Обоснование решения
          <textarea name="reason" required minLength={10} maxLength={2000} />
        </label>
        <button className="button" disabled={busy}>
          Сохранить решение
        </button>
      </form>
      {!terminal && latest && (
        <details>
          <summary>Исправить материал перед публикацией</summary>
          <form
            className="stack"
            aria-label="Редактирование материала"
            key={latest.id}
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              void save('editContent', {
                url: values.get('url'),
                title: values.get('title'),
                summary: values.get('summary'),
                category: values.get('category'),
                geography: values.get('geography'),
                language: values.get('language'),
                publishedAt: isoDate(values.get('publishedAt')),
                deadline: isoDate(values.get('deadline')),
                eventDate: isoDate(values.get('eventDate')),
                reason: values.get('reason'),
              });
            }}
          >
            <label className="field">
              Ссылка на оригинал
              <input
                name="url"
                type="url"
                required
                defaultValue={latest.canonicalUrl ?? detail.item.canonicalUrl}
              />
            </label>
            <label className="field">
              Заголовок
              <input
                name="title"
                required
                minLength={8}
                maxLength={200}
                defaultValue={latest.title}
              />
            </label>
            <label className="field">
              Краткое содержание
              <textarea name="summary" maxLength={600} defaultValue={latest.summary} />
            </label>
            <label className="field">
              Категория
              <select name="category" defaultValue={latest.category}>
                {[
                  ['hackathon', 'Хакатон'],
                  ['competition', 'Конкурс'],
                  ['internship', 'Стажировка'],
                  ['event', 'Мероприятие'],
                  ['grant', 'Грант'],
                  ['scholarship', 'Стипендия'],
                  ['training', 'Обучение'],
                  ['news', 'Новость'],
                  ['article', 'Статья'],
                  ['other', 'Другое'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              География
              <input name="geography" maxLength={120} defaultValue={latest.geography} />
            </label>
            <label className="field">
              Язык
              <input name="language" maxLength={20} required defaultValue={latest.language} />
            </label>
            <label className="field">
              Дата источника (если подтверждена)
              <input
                name="publishedAt"
                type="datetime-local"
                defaultValue={latest.publishedAt ? localDate(latest.publishedAt) : ''}
              />
            </label>
            <label className="field">
              Срок подачи (если подтверждён)
              <input
                name="deadline"
                type="datetime-local"
                defaultValue={latest.deadline ? localDate(latest.deadline) : ''}
              />
            </label>
            <label className="field">
              Дата события (если подтверждена)
              <input
                name="eventDate"
                type="datetime-local"
                defaultValue={latest.eventDate ? localDate(latest.eventDate) : ''}
              />
            </label>
            <label className="field">
              Причина изменения
              <textarea name="reason" required minLength={10} maxLength={2000} />
            </label>
            <button className="button secondary" disabled={busy}>
              Сохранить новую редакцию
            </button>
          </form>
        </details>
      )}
      <details>
        <summary>История редакций ({detail.historyTotal}) и сравнение</summary>
        <div className="form-grid">
          <label className="field">
            Первая редакция
            <select value={first?.id ?? ''} onChange={(event) => setLeft(event.target.value)}>
              {detail.history.map((rev) => (
                <option key={rev.id} value={rev.id}>
                  № {rev.number} · {rev.origin}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Вторая редакция
            <select value={second?.id ?? ''} onChange={(event) => setRight(event.target.value)}>
              {detail.history.map((rev) => (
                <option key={rev.id} value={rev.id}>
                  № {rev.number} · {rev.origin}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          {[first, second].map(
            (rev, index) =>
              rev && (
                <article className="summary-card stack" key={index}>
                  <strong>
                    Редакция {rev.number}: {rev.title}
                  </strong>
                  <p>{rev.summary}</p>
                  <p>
                    {rev.category} · {rev.geography || 'География не установлена'} · {rev.language}
                  </p>
                  <p className="small-text">
                    {rev.canonicalUrl ?? 'Историческая ссылка не сохранена'}
                  </p>
                  <p>
                    Источник:{' '}
                    {rev.publishedAt ? date(rev.publishedAt, true) : 'дата не установлена'}. Подача:{' '}
                    {rev.deadline ? date(rev.deadline, true) : 'срок не установлен'}. Событие:{' '}
                    {rev.eventDate ? date(rev.eventDate, true) : 'дата не установлена'}.
                  </p>
                  <p className="muted small-text">Сохранено: {date(rev.createdAt, true)}</p>
                </article>
              ),
          )}
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            Новые редакции
          </button>
          <span>Страница истории {page}</span>
          <button
            className="button secondary"
            disabled={page * 20 >= detail.historyTotal || busy}
            onClick={() => setPage(page + 1)}
          >
            Старые редакции
          </button>
        </div>
      </details>
      <details>
        <summary>Последние решения и изменения</summary>
        {detail.audits.map((audit) => (
          <article className="summary-card" key={audit.id}>
            <strong>{audit.action}</strong>
            <p>{audit.reason}</p>
            <p className="small-text">
              {date(audit.createdAt, true)} ·{' '}
              {audit.actorId ? `Администратор ${audit.actorId}` : 'Система'} · редакция{' '}
              {audit.revisionId ?? 'не указана'}
            </p>
          </article>
        ))}
      </details>
    </section>
  );
}
