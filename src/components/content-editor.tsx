'use client';
import { MarketplaceMessage, useMarketplaceCopy } from './marketplace-copy';
import { useEffect, useState } from 'react';
import {
  contentDetailDataSchema,
  contentMutationDataSchema,
  type ContentDetailData,
} from '@/contracts/content-intake';
import { requestClientData, CLIENT_WRITE_REFRESH_ERROR } from '@/lib/client-data-response';
import { adminCodeLabel } from '@/lib/admin-labels';
import { localizedOpportunityCategoryLabels } from '@/lib/localized-opportunity-labels';
import { date } from '@/lib/labels';
import { ActionFeedback } from './platform';

async function readDetail(id: string, page: number): Promise<ContentDetailData> {
  return requestClientData(
    contentDetailDataSchema.refine((data) => data.item.revisions.length > 0),
    `/api/admin/content/${encodeURIComponent(id)}?page=${page}`,
  );
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
  onSaved: () => Promise<boolean>;
  onClose: () => void;
}) {
  const { locale, copy } = useMarketplaceCopy();
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
  async function reloadDetail() {
    if (busy) return;
    setBusy(true);
    try {
      setDetail(await readDetail(id, page));
      setError('');
      setSuccess('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ошибка чтения.');
    } finally {
      setBusy(false);
    }
  }
  async function save(action: string, fields: Record<string, unknown>) {
    if (!detail || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    let committed = false;
    try {
      await requestClientData(contentMutationDataSchema, '/api/admin/content', {
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
      committed = true;
      const updated = await readDetail(id, page);
      if (!(await onSaved())) throw new Error(CLIENT_WRITE_REFRESH_ERROR);
      setDetail(updated);
      setSuccess('Сохранено. Решение записано в журнал.');
    } catch (e) {
      setError(
        committed
          ? CLIENT_WRITE_REFRESH_ERROR
          : e instanceof Error
            ? e.message
            : 'Ошибка сохранения.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!detail)
    return (
      <section lang={locale} className="panel stack" aria-label={copy('Редакционная проверка')}>
        <p role={error ? 'alert' : 'status'}>
          {error ? <MarketplaceMessage text={error} /> : copy('Загрузка материала…')}
        </p>
        <button className="button secondary" disabled={busy} onClick={() => void reloadDetail()}>
          {copy('Обновить материал')}
        </button>
        <button className="button secondary" onClick={onClose}>
          {copy('Закрыть проверку')}
        </button>
      </section>
    );
  const latest = detail.item.revisions[0];
  const first = detail.history.find((revision) => revision.id === left) ?? detail.history[0];
  const second =
    detail.history.find((revision) => revision.id === right) ?? detail.history[1] ?? first;
  const terminal = ['rejected', 'archived', 'withdrawn'].includes(detail.item.status);
  return (
    <section
      lang={locale}
      className="panel stack content-editor"
      aria-label={copy('Редакционная проверка')}
    >
      <div className="button-row">
        <h3>{copy('Редакционная проверка')}</h3>
        <button className="button secondary" disabled={busy} onClick={() => void reloadDetail()}>
          {copy('Обновить материал')}
        </button>
        <button className="button secondary" onClick={onClose}>
          {copy('Закрыть проверку')}
        </button>
      </div>
      <p>
        <strong>
          <span lang="und">{latest?.title}</span>
        </strong>{' '}
        · {adminCodeLabel(detail.item.status, locale)} {copy('· редакция')} {latest?.number}
      </p>
      <p>
        {copy('Источник:')} <span lang="und">{detail.source.name}</span>.{' '}
        <span lang="und">{detail.source.rightsNote}</span>
      </p>
      {detail.source.termsUrl && (
        <a href={detail.source.termsUrl} target="_blank" rel="noopener noreferrer">
          {copy('Условия источника')}
        </a>
      )}
      <p>
        {copy('Одобренная редакция:')}{' '}
        {detail.item.approvedRevisionId
          ? `№ ${detail.history.find((rev) => rev.id === detail.item.approvedRevisionId)?.number ?? copy('в истории')}`
          : copy('пока нет')}{' '}
        {copy('. Актуальна до:')}{' '}
        {detail.item.expiresAt ? date(detail.item.expiresAt, true, locale) : copy('не задано')}.
      </p>
      <p>
        {copy(
          'Проверьте оригинал, аудиторию, даты и право на публикацию. Релевантность правилам не подтверждает достоверность. Изменение текста снимает материал с выдачи до нового решения.',
        )}
      </p>
      <div className="stack">
        <button
          type="button"
          className="button secondary"
          disabled={busy || !detail.source.enabled}
          onClick={() => void save('inspectContentPage', {})}
        >
          {busy ? copy('Подождите…') : copy('Проверить сроки и условия на сайте')}
        </button>
        <p className="muted small-text">
          {copy(
            'Результат сохраняется в журнале ниже и относится к выбранной редакции. Повторная проверка — не чаще раза в минуту. Формы и вложения не проверяются; текст и публикация не изменяются.',
          )}
        </p>
      </div>
      <ActionFeedback error={error} success={success} />
      <form
        className="stack"
        aria-label={copy('Решение по материалу')}
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
          {copy('Решение')}{' '}
          <select
            name="decision"
            defaultValue={
              terminal ? 'reopen' : detail.item.status === 'published' ? 'archive' : 'publish'
            }
          >
            {!terminal && detail.item.status !== 'published' && (
              <option value="publish">{copy('Опубликовать проверенную редакцию')}</option>
            )}
            {!terminal && <option value="reject">{copy('Отклонить')}</option>}
            {detail.item.status !== 'archived' && (
              <option value="archive">{copy('В архив')}</option>
            )}
            {detail.item.status !== 'withdrawn' && (
              <option value="withdraw">{copy('Отозвать')}</option>
            )}
            {terminal && <option value="reopen">{copy('Вернуть на проверку')}</option>}
          </select>
        </label>
        <label className="field">
          {copy('Актуально до (для публикации, максимум 90 дней)')}{' '}
          <input name="expiresAt" type="datetime-local" defaultValue={defaultExpiry} />
        </label>
        <p className="small-text muted">
          {copy(
            'Более ранние срок подачи или дата события ограничат этот срок. Неизвестный дедлайн не выдумывается.',
          )}
        </p>
        <label className="field">
          {copy('Обоснование решения')}{' '}
          <textarea name="reason" required minLength={10} maxLength={2000} />
        </label>
        <button className="button" disabled={busy}>
          {copy('Сохранить решение')}
        </button>
      </form>
      {!terminal && latest && (
        <details>
          <summary>{copy('Исправить материал перед публикацией')}</summary>
          <form
            className="stack"
            aria-label={copy('Редактирование материала')}
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
              {copy('Ссылка на оригинал')}{' '}
              <input
                name="url"
                type="url"
                required
                defaultValue={latest.canonicalUrl ?? detail.item.canonicalUrl}
              />
            </label>
            <label className="field">
              {copy('Заголовок')}{' '}
              <input
                name="title"
                required
                minLength={8}
                maxLength={200}
                defaultValue={latest.title}
              />
            </label>
            <label className="field">
              {copy('Краткое содержание')}{' '}
              <textarea name="summary" maxLength={600} defaultValue={latest.summary} />
            </label>
            <label className="field">
              {copy('Категория')}{' '}
              <select name="category" defaultValue={latest.category}>
                {[
                  ['hackathon', copy('Хакатон')],
                  ['competition', copy('Конкурс')],
                  ['internship', copy('Стажировка')],
                  ['event', copy('Мероприятие')],
                  ['grant', copy('Грант')],
                  ['scholarship', copy('Стипендия')],
                  ['training', copy('Обучение')],
                  ['news', copy('Новость')],
                  ['article', copy('Статья')],
                  ['other', copy('Другое')],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {copy('География')}{' '}
              <input name="geography" maxLength={120} defaultValue={latest.geography} />
            </label>
            <label className="field">
              {copy('Язык')}{' '}
              <input name="language" maxLength={20} required defaultValue={latest.language} />
            </label>
            <label className="field">
              {copy('Дата источника (если подтверждена)')}{' '}
              <input
                name="publishedAt"
                type="datetime-local"
                defaultValue={latest.publishedAt ? localDate(latest.publishedAt) : ''}
              />
            </label>
            <label className="field">
              {copy('Срок подачи (если подтверждён)')}{' '}
              <input
                name="deadline"
                type="datetime-local"
                defaultValue={latest.deadline ? localDate(latest.deadline) : ''}
              />
            </label>
            <label className="field">
              {copy('Дата события (если подтверждена)')}{' '}
              <input
                name="eventDate"
                type="datetime-local"
                defaultValue={latest.eventDate ? localDate(latest.eventDate) : ''}
              />
            </label>
            <label className="field">
              {copy('Причина изменения')}{' '}
              <textarea name="reason" required minLength={10} maxLength={2000} />
            </label>
            <button className="button secondary" disabled={busy}>
              {copy('Сохранить новую редакцию')}
            </button>
          </form>
        </details>
      )}
      <details>
        <summary>
          {copy('История редакций (')}
          {detail.historyTotal}
          {copy(') и сравнение')}
        </summary>
        <div className="form-grid">
          <label className="field">
            {copy('Первая редакция')}{' '}
            <select value={first?.id ?? ''} onChange={(event) => setLeft(event.target.value)}>
              {detail.history.map((rev) => (
                <option key={rev.id} value={rev.id}>
                  № {rev.number} · {adminCodeLabel(rev.origin, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {copy('Вторая редакция')}{' '}
            <select value={second?.id ?? ''} onChange={(event) => setRight(event.target.value)}>
              {detail.history.map((rev) => (
                <option key={rev.id} value={rev.id}>
                  № {rev.number} · {adminCodeLabel(rev.origin, locale)}
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
                    {copy('Редакция')} {rev.number}: <span lang="und">{rev.title}</span>
                  </strong>
                  <p>
                    <span lang="und">{rev.summary}</span>
                  </p>
                  <p>
                    {localizedOpportunityCategoryLabels(locale)[rev.category] ?? rev.category} ·{' '}
                    {rev.geography || copy('География не установлена')} · {rev.language}
                  </p>
                  <p className="small-text">
                    {rev.canonicalUrl ?? copy('Историческая ссылка не сохранена')}
                  </p>
                  <p>
                    {copy('Источник:')}{' '}
                    {rev.publishedAt
                      ? date(rev.publishedAt, true, locale)
                      : copy('дата не установлена')}
                    {copy('. Подача:')}{' '}
                    {rev.deadline ? date(rev.deadline, true, locale) : copy('срок не установлен')}
                    {copy('. Событие:')}{' '}
                    {rev.eventDate
                      ? date(rev.eventDate, true, locale)
                      : copy('дата не установлена')}
                    .
                  </p>
                  <p className="muted small-text">
                    {copy('Сохранено:')} {date(rev.createdAt, true, locale)}
                  </p>
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
            {copy('Новые редакции')}
          </button>
          <span>
            {copy('Страница истории')} {page}
          </span>
          <button
            className="button secondary"
            disabled={page * 20 >= detail.historyTotal || busy}
            onClick={() => setPage(page + 1)}
          >
            {copy('Старые редакции')}
          </button>
        </div>
      </details>
      <details>
        <summary>{copy('Последние решения и изменения')}</summary>
        {detail.audits.map((audit) => (
          <article className="summary-card" key={audit.id}>
            <strong>{adminCodeLabel(audit.action, locale)}</strong>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              <span lang="und">{audit.reason}</span>
            </p>
            <p className="small-text">
              {date(audit.createdAt, true, locale)} ·{' '}
              {audit.actorId ? `${copy('Администратор')} ${audit.actorId}` : copy('Система')}{' '}
              {copy('· редакция')} {audit.revisionId ?? copy('не указана')}
            </p>
          </article>
        ))}
      </details>
    </section>
  );
}
