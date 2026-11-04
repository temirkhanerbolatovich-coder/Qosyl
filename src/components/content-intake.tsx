'use client';
import { useMarketplaceCopy } from './marketplace-copy';
import { OpportunityFilters } from './opportunity-filters';
import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  contentIntakeDataSchema,
  contentMutationDataSchema,
  type ContentIntakeData,
} from '@/contracts/content-intake';
import { requestClientData, CLIENT_WRITE_REFRESH_ERROR } from '@/lib/client-data-response';
import { ActionFeedback, LoadState } from './platform';
import { adminCodeLabel } from '@/lib/admin-labels';
import { date } from '@/lib/labels';
import { ContentEditor } from './content-editor';

async function readContentIntake(
  page: number,
  status: string,
  signal?: AbortSignal,
  filters = '',
): Promise<ContentIntakeData> {
  return requestClientData(
    contentIntakeDataSchema,
    `/api/admin/content?page=${page}${status ? `&status=${status}` : ''}${filters ? `&${filters}` : ''}`,
    { signal: signal ?? AbortSignal.timeout(20000) },
  );
}

export function ContentIntakePanel() {
  const { locale, copy } = useMarketplaceCopy();
  const [data, setData] = useState<ContentIntakeData | null>(null);
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1);
  const [filters, setFilters] = useState('');
  const [status, setStatus] = useState(''),
    [selected, setSelected] = useState('');
  const refresh = useCallback(async () => {
    try {
      setData(await readContentIntake(page, status, undefined, filters));
      setError('');
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ошибка загрузки.');
      return false;
    }
  }, [page, status, filters]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void readContentIntake(
      page,
      status,
      AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      filters,
    )
      .then((result) => {
        if (active) {
          setData(result);
          setError('');
        }
      })
      .catch((error: unknown) => {
        if (active) setError(error instanceof Error ? error.message : 'Ошибка загрузки.');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [page, status, filters]);
  async function run(action: string, fields: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError('');
    setSuccess('');
    let committed = false;
    try {
      const result = await requestClientData(contentMutationDataSchema, '/api/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...fields }),
        signal: AbortSignal.timeout(20000),
      });
      committed = true;
      if (!(await refresh())) throw new Error(CLIENT_WRITE_REFRESH_ERROR);
      setSuccess(
        'runId' in result
          ? 'Импорт поставлен в очередь. Обновите список после прохода worker.'
          : 'Сохранено. Публикация не выполнялась.',
      );
      return true;
    } catch (error) {
      setError(
        committed
          ? CLIENT_WRITE_REFRESH_ERROR
          : error instanceof Error
            ? error.message
            : 'Ошибка сохранения.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <LoadState error={error} retry={refresh} />;
  return (
    <section
      lang={locale}
      className="stack content-intake"
      aria-label={copy('Закрытый сбор возможностей')}
    >
      <div className="panel stack">
        <h2>{copy('Закрытый сбор возможностей')}</h2>
        <p>
          {copy(
            'Импорт сохраняет материалы для проверки. В публичную ленту попадает только редакция, которую администратор одобрил с указанием срока актуальности.',
          )}
        </p>
        <p>
          {copy('Сбор:')}{' '}
          <strong>{data.settings.enabled ? copy('включён') : copy('выключен')}</strong>
          {copy(
            '. Выключение запрещает новые внешние запросы и скрывает публичную ленту; результат уже начатого запроса не сохраняется.',
          )}
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void run('setModuleEnabled', { enabled: !data.settings.enabled })}
          >
            {data.settings.enabled ? copy('Выключить сбор') : copy('Включить сбор')}
          </button>
          <button className="button secondary" disabled={busy} onClick={() => void refresh()}>
            {copy('Обновить очередь')}
          </button>
        </div>
        <ActionFeedback error={error} success={success} />
      </div>
      <form
        className="panel stack"
        aria-label={copy('Добавление источника')}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const f = new FormData(form);
          const feedUrl = String(f.get('feedUrl') || '').trim(),
            termsUrl = String(f.get('termsUrl') || '').trim();
          if (
            await run('createSource', {
              name: f.get('name'),
              type: f.get('type'),
              allowedHost: f.get('allowedHost'),
              rightsNote: f.get('rightsNote'),
              ...(feedUrl ? { feedUrl } : {}),
              ...(termsUrl ? { termsUrl } : {}),
              enabled: false,
              intervalMinutes: 360,
              maxItems: 50,
            })
          )
            form.reset();
        }}
      >
        <h3>{copy('Добавить источник')}</h3>
        <div className="form-grid">
          <label className="field">
            {copy('Название')} <input name="name" required minLength={3} maxLength={100} />
          </label>
          <label className="field">
            {copy('Тип')}{' '}
            <select name="type">
              <option value="manual">{copy('Ручной ввод')}</option>
              <option value="rss">RSS / Atom</option>
              <option value="html">{copy('Сайт / HTML')}</option>
            </select>
          </label>
        </div>
        <label className="field">
          {copy('Разрешённый домен')}{' '}
          <input name="allowedHost" required placeholder="example.org" />
        </label>
        <label className="field">
          {copy('HTTPS-адрес RSS или страницы сайта')} <input name="feedUrl" type="url" />
        </label>
        <label className="field">
          {copy('Условия использования: ссылка')} <input name="termsUrl" type="url" />
        </label>
        <label className="field">
          {copy('Основание использования и ограничения')}{' '}
          <textarea name="rightsNote" required minLength={10} maxLength={2000} />
        </label>
        <button className="button" disabled={busy}>
          {copy('Добавить выключенный источник')}
        </button>
      </form>
      <div className="panel stack">
        <h3>{copy('Источники')}</h3>
        {!data.sources.length && <p>{copy('Источники пока не добавлены.')}</p>}
        {data.sources.map((source) => (
          <article className="summary-card stack" key={source.id}>
            <strong>
              <span lang="und">{source.name}</span> · {adminCodeLabel(source.type, locale)} ·{' '}
              {source.enabled ? copy('включён') : copy('выключен')}
            </strong>
            <p>{source.allowedHost}</p>
            <p className="muted small-text">
              <span lang="und">{source.rightsNote}</span>
            </p>
            <p>
              {copy('Последняя проверка:')}{' '}
              {source.lastCheckedAt
                ? date(source.lastCheckedAt, true, locale)
                : copy('не выполнялась')}
              {copy('. Ошибок подряд:')} {source.consecutiveErrors}.
            </p>
            <div className="button-row">
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() =>
                  void run('setSourceEnabled', { sourceId: source.id, enabled: !source.enabled })
                }
              >
                {source.enabled ? copy('Отключить источник') : copy('Включить источник')}
              </button>
              {['rss', 'html'].includes(source.type) && (
                <button
                  className="button secondary small"
                  disabled={busy || !source.enabled || !data.settings.enabled}
                  onClick={() => void run('requestSync', { sourceId: source.id })}
                >
                  {copy('Поставить импорт в очередь')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <form
        className="panel stack"
        aria-label={copy('Ручной материал')}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget,
            f = new FormData(form);
          if (
            await run('addManualContent', {
              sourceId: f.get('sourceId'),
              url: f.get('url'),
              title: f.get('title'),
              summary: f.get('summary'),
              category: f.get('category'),
              geography: '',
              language: 'ru',
            })
          )
            form.reset();
        }}
      >
        <h3>{copy('Ручной материал')}</h3>
        <label className="field">
          {copy('Ручной источник')}{' '}
          <select name="sourceId" required>
            {data.sources
              .filter((s) => s.type === 'manual' && s.enabled)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          {copy('Ссылка на оригинал')} <input name="url" type="url" required />
        </label>
        <label className="field">
          {copy('Заголовок')} <input name="title" required minLength={8} maxLength={200} />
        </label>
        <label className="field">
          {copy('Краткое содержание')} <textarea name="summary" maxLength={600} />
        </label>
        <label className="field">
          {copy('Категория')}{' '}
          <select name="category">
            <option value="hackathon">{copy('Хакатон')}</option>
            <option value="competition">{copy('Конкурс')}</option>
            <option value="internship">{copy('Стажировка')}</option>
            <option value="event">{copy('Мероприятие')}</option>
            <option value="grant">{copy('Грант')}</option>
            <option value="scholarship">{copy('Стипендия')}</option>
            <option value="training">{copy('Обучение')}</option>
            <option value="news">{copy('Новость')}</option>
            <option value="article">{copy('Статья')}</option>
            <option value="other">{copy('Требует классификации')}</option>
          </select>
        </label>
        <button
          className="button"
          disabled={
            busy ||
            !data.settings.enabled ||
            !data.sources.some((s) => s.type === 'manual' && s.enabled)
          }
        >
          {copy('Сохранить в закрытую очередь')}
        </button>
      </form>
      <div className="panel stack">
        <h3>
          {copy('Материалы:')} {data.total}
        </h3>
        <OpportunityFilters
          onSearch={(query) => {
            setFilters(query);
            setPage(1);
          }}
        />
        <label className="field">
          {copy('Раздел материалов')}{' '}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{copy('Все материалы')}</option>
            <option value="pending_review">{copy('На проверке')}</option>
            <option value="published">{copy('Опубликованные')}</option>
            <option value="rejected">{copy('Отклонённые')}</option>
            <option value="archived">{copy('Архив')}</option>
            <option value="withdrawn">{copy('Отозванные')}</option>
          </select>
        </label>
        {data.items.map((item) => (
          <Fragment key={item.id}>
            <article className="summary-card stack">
              <strong>
                <span lang="und">{item.revisions[0]?.title ?? item.id}</span>
              </strong>
              <p>
                <span lang="und">{item.revisions[0]?.summary}</span>
              </p>
              <p className="muted small-text">
                {adminCodeLabel(item.status, locale)} {copy('· редакция')}{' '}
                {item.revisions[0]?.number} {copy('· релевантность')} {item.revisions[0]?.score}/100
              </p>
              <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer">
                {copy('Оригинал')}
              </a>
              <p className="muted small-text">
                {copy('Дата источника:')}{' '}
                {item.revisions[0]?.publishedAt
                  ? date(item.revisions[0].publishedAt, true, locale)
                  : copy('не установлена')}
                .{' '}
                {item.revisions[0]?.deadline
                  ? `${locale === 'kk' ? 'Өтінім мерзімі:' : 'Срок подачи:'} ${date(item.revisions[0].deadline, true, locale)}.`
                  : copy('Срок подачи не подтверждён.')}
              </p>
              <button className="button secondary" onClick={() => setSelected(item.id)}>
                {copy('Проверить и открыть историю')}
              </button>
            </article>
            {selected === item.id && (
              <ContentEditor
                key={selected}
                id={selected}
                onSaved={refresh}
                onClose={() => setSelected('')}
              />
            )}
          </Fragment>
        ))}
        <div className="button-row">
          <button
            className="button secondary"
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            {copy('Назад')}
          </button>
          <span>
            {copy('Страница')} {page}
          </span>
          <button
            className="button secondary"
            disabled={page * 20 >= data.total || busy}
            onClick={() => setPage(page + 1)}
          >
            {copy('Далее')}
          </button>
        </div>
      </div>
      <div className="panel stack">
        <h3>{copy('Запуски импорта')}</h3>
        {data.runs.map((run) => (
          <article className="summary-card" key={run.id}>
            <strong>{adminCodeLabel(run.status, locale)}</strong>
            <p>
              {date(run.requestedAt, true, locale)}
              {copy('. Найдено:')} {run.found}
              {copy('; новых:')} {run.created}
              {copy('; редакций:')} {run.updated}
              {copy('; дублей:')} {run.duplicates}
              {copy('; отсеяно:')} {run.discarded}.
            </p>
            {run.errorCode && (
              <p>
                {copy('Код ошибки:')} {run.errorCode}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
