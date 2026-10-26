'use client';
import { OpportunityFilters } from './opportunity-filters';
import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ContentIntakeData } from '@/contracts/content-intake';
import { ActionFeedback, LoadState } from './platform';
import { date } from '@/lib/labels';
import { ContentEditor } from './content-editor';

async function readContentIntake(
  page: number,
  status: string,
  signal?: AbortSignal,
  filters = '',
): Promise<ContentIntakeData> {
  const response = await fetch(
    `/api/admin/content?page=${page}${status ? `&status=${status}` : ''}${filters ? `&${filters}` : ''}`,
    {
      cache: 'no-store',
      signal: signal ?? AbortSignal.timeout(20000),
    },
  );
  const body = await response.json();
  if (!response.ok || !body.data) throw new Error(body.error || 'Не удалось прочитать очередь.');
  return body.data;
}

export function ContentIntakePanel() {
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
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ошибка загрузки.');
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
    try {
      const response = await fetch('/api/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...fields }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Действие не выполнено.');
      setSuccess(
        body.data.runId
          ? 'Импорт поставлен в очередь. Обновите список после прохода worker.'
          : 'Сохранено. Публикация не выполнялась.',
      );
      await refresh();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ошибка сохранения.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <LoadState error={error} retry={refresh} />;
  return (
    <section className="stack content-intake" aria-label="Закрытый сбор возможностей">
      <div className="panel stack">
        <h2>Закрытый сбор возможностей</h2>
        <p>
          Импорт сохраняет материалы для проверки. В публичную ленту попадает только редакция,
          которую администратор одобрил с указанием срока актуальности.
        </p>
        <p>
          Сбор: <strong>{data.settings.enabled ? 'включён' : 'выключен'}</strong>. Выключение
          запрещает новые внешние запросы и скрывает публичную ленту; результат уже начатого запроса
          не сохраняется.
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void run('setModuleEnabled', { enabled: !data.settings.enabled })}
          >
            {data.settings.enabled ? 'Выключить сбор' : 'Включить сбор'}
          </button>
          <button className="button secondary" disabled={busy} onClick={() => void refresh()}>
            Обновить очередь
          </button>
        </div>
        <ActionFeedback error={error} success={success} />
      </div>
      <form
        className="panel stack"
        aria-label="Добавление источника"
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
        <h3>Добавить источник</h3>
        <div className="form-grid">
          <label className="field">
            Название
            <input name="name" required minLength={3} maxLength={100} />
          </label>
          <label className="field">
            Тип
            <select name="type">
              <option value="manual">Ручной ввод</option>
              <option value="rss">RSS / Atom</option>
              <option value="html">Сайт / HTML</option>
            </select>
          </label>
        </div>
        <label className="field">
          Разрешённый домен
          <input name="allowedHost" required placeholder="example.org" />
        </label>
        <label className="field">
          HTTPS-адрес RSS или страницы сайта
          <input name="feedUrl" type="url" />
        </label>
        <label className="field">
          Условия использования: ссылка
          <input name="termsUrl" type="url" />
        </label>
        <label className="field">
          Основание использования и ограничения
          <textarea name="rightsNote" required minLength={10} maxLength={2000} />
        </label>
        <button className="button" disabled={busy}>
          Добавить выключенный источник
        </button>
      </form>
      <div className="panel stack">
        <h3>Источники</h3>
        {!data.sources.length && <p>Источники пока не добавлены.</p>}
        {data.sources.map((source) => (
          <article className="summary-card stack" key={source.id}>
            <strong>
              {source.name} · {source.type} · {source.enabled ? 'включён' : 'выключен'}
            </strong>
            <p>{source.allowedHost}</p>
            <p className="muted small-text">{source.rightsNote}</p>
            <p>
              Последняя проверка:{' '}
              {source.lastCheckedAt ? date(source.lastCheckedAt, true) : 'не выполнялась'}. Ошибок
              подряд: {source.consecutiveErrors}.
            </p>
            <div className="button-row">
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() =>
                  void run('setSourceEnabled', { sourceId: source.id, enabled: !source.enabled })
                }
              >
                {source.enabled ? 'Отключить источник' : 'Включить источник'}
              </button>
              {['rss', 'html'].includes(source.type) && (
                <button
                  className="button secondary small"
                  disabled={busy || !source.enabled || !data.settings.enabled}
                  onClick={() => void run('requestSync', { sourceId: source.id })}
                >
                  Поставить импорт в очередь
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <form
        className="panel stack"
        aria-label="Ручной материал"
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
        <h3>Ручной материал</h3>
        <label className="field">
          Ручной источник
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
          Ссылка на оригинал
          <input name="url" type="url" required />
        </label>
        <label className="field">
          Заголовок
          <input name="title" required minLength={8} maxLength={200} />
        </label>
        <label className="field">
          Краткое содержание
          <textarea name="summary" maxLength={600} />
        </label>
        <label className="field">
          Категория
          <select name="category">
            <option value="hackathon">Хакатон</option>
            <option value="competition">Конкурс</option>
            <option value="internship">Стажировка</option>
            <option value="event">Мероприятие</option>
            <option value="grant">Грант</option>
            <option value="scholarship">Стипендия</option>
            <option value="training">Обучение</option>
            <option value="news">Новость</option>
            <option value="article">Статья</option>
            <option value="other">Требует классификации</option>
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
          Сохранить в закрытую очередь
        </button>
      </form>
      <div className="panel stack">
        <h3>Материалы: {data.total}</h3>
        <OpportunityFilters
          onSearch={(query) => {
            setFilters(query);
            setPage(1);
          }}
        />
        <label className="field">
          Раздел материалов
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Все материалы</option>
            <option value="pending_review">На проверке</option>
            <option value="published">Опубликованные</option>
            <option value="rejected">Отклонённые</option>
            <option value="archived">Архив</option>
            <option value="withdrawn">Отозванные</option>
          </select>
        </label>
        {data.items.map((item) => (
          <Fragment key={item.id}>
            <article className="summary-card stack">
              <strong>{item.revisions[0]?.title ?? item.id}</strong>
              <p>{item.revisions[0]?.summary}</p>
              <p className="muted small-text">
                {item.status} · редакция {item.revisions[0]?.number} · релевантность{' '}
                {item.revisions[0]?.score}/100
              </p>
              <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer">
                Оригинал
              </a>
              <p className="muted small-text">
                Дата источника:{' '}
                {item.revisions[0]?.publishedAt
                  ? date(item.revisions[0].publishedAt, true)
                  : 'не установлена'}
                .{' '}
                {item.revisions[0]?.deadline
                  ? `Срок подачи: ${date(item.revisions[0].deadline, true)}.`
                  : 'Срок подачи не подтверждён.'}
              </p>
              <button className="button secondary" onClick={() => setSelected(item.id)}>
                Проверить и открыть историю
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
            Назад
          </button>
          <span>Страница {page}</span>
          <button
            className="button secondary"
            disabled={page * 20 >= data.total || busy}
            onClick={() => setPage(page + 1)}
          >
            Далее
          </button>
        </div>
      </div>
      <div className="panel stack">
        <h3>Запуски импорта</h3>
        {data.runs.map((run) => (
          <article className="summary-card" key={run.id}>
            <strong>{run.status}</strong>
            <p>
              {date(run.requestedAt, true)}. Найдено: {run.found}; новых: {run.created}; редакций:{' '}
              {run.updated}; дублей: {run.duplicates}; отсеяно: {run.discarded}.
            </p>
            {run.errorCode && <p>Код ошибки: {run.errorCode}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
