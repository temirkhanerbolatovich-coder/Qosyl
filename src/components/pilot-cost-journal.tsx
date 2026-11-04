'use client';
import { useMarketplaceCopy } from './marketplace-copy';
import { useRef, useState } from 'react';
import { date, money } from '@/lib/labels';
import { ActionFeedback, LoadState, useAction, useData } from './platform';

const kindLabels = {
  acquisition: 'Привлечение',
  moderation: 'Модерация',
  support: 'Сопровождение',
  operations: 'Эксплуатация',
};
export function PilotCostJournal() {
  const { locale, copy } = useMarketplaceCopy();
  const [page, setPage] = useState(1);
  const { data, error, loading, refresh } = useData('pilotCosts', { page: String(page) });
  const action = useAction(refresh);
  const requestKey = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const [voidId, setVoidId] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    requestKey.current ??= crypto.randomUUID();
    const projectId = String(values.get('projectId') ?? '').trim();
    const result = await action.run(
      'recordPilotCost',
      {
        idempotencyKey: requestKey.current,
        ...(projectId ? { projectId } : {}),
        kind: values.get('kind'),
        occurredAt: new Date(String(values.get('occurredAt'))).toISOString(),
        minutes: Number(values.get('minutes')),
        amountKzt: Number(values.get('amountKzt')),
        description: values.get('description'),
      },
      'Расход сохранён. Повтор этого запроса не создаст вторую запись.',
    );
    if (result) {
      requestKey.current = null;
      form.current?.reset();
      setPage(1);
    }
  }

  return (
    <section lang={locale} className="panel stack" aria-label={copy('Журнал затрат пилота')}>
      <h2>{copy('Журнал затрат пилота')}</h2>
      <p className="muted small-text">
        {copy(
          'Время команды и денежные расходы учитываются отдельно за всю историю журнала. Стоимость часа и доход площадки автоматически не предполагаются. Не записывайте контакты, реквизиты и другие персональные данные в описание.',
        )}
      </p>
      {data && (
        <p>
          {copy('Учтено:')} {data.totals.minutes} {copy('мин. и')}{' '}
          {money(data.totals.amountKzt, locale)} {copy('в')} {data.totals.entries}{' '}
          {copy('записях. Отменено:')} {data.totals.voidedEntries}.
        </p>
      )}
      <ActionFeedback error={action.error} success={action.success} />
      <form ref={form} className="stack" onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            {copy('Категория расхода')}{' '}
            <select name="kind" defaultValue="moderation" disabled={action.busy}>
              {Object.entries(kindLabels).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {copy(label)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {copy('Дата и время расхода (время устройства)')}{' '}
            <input name="occurredAt" type="datetime-local" required disabled={action.busy} />
          </label>
          <label className="field">
            {copy('Время команды, минут')}{' '}
            <input
              name="minutes"
              type="number"
              min="0"
              max="100000"
              step="1"
              required
              defaultValue="0"
              disabled={action.busy}
            />
          </label>
          <label className="field">
            {copy('Денежный расход, ₸')}{' '}
            <input
              name="amountKzt"
              type="number"
              min="0"
              max="10000000"
              step="1"
              required
              defaultValue="0"
              disabled={action.busy}
            />
          </label>
        </div>
        <label className="field">
          {copy('ID реального проекта (необязательно)')}{' '}
          <input name="projectId" maxLength={100} disabled={action.busy} />
        </label>
        <label className="field">
          {copy('Описание расхода')}{' '}
          <textarea
            name="description"
            minLength={3}
            maxLength={1000}
            required
            disabled={action.busy}
            placeholder={copy('Например, проверка брифа и критериев приёмки')}
          />
        </label>
        <p className="muted small-text">
          {copy(
            'Если ответ потерян, повторите сохранение с теми же полями. Ключ запроса сохраняется до подтверждения. Перед созданием другой записи обновите журнал и проверьте результат.',
          )}
        </p>
        <div className="button-row">
          <button className="button" type="submit" disabled={action.busy}>
            {copy('Сохранить расход')}
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={action.busy}
            onClick={() => {
              requestKey.current = null;
              form.current?.reset();
            }}
          >
            {copy('Новая запись')}
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={action.busy}
            onClick={() => void refresh()}
          >
            {copy('Обновить журнал')}
          </button>
        </div>
      </form>
      {error || loading ? (
        <LoadState error={error} retry={refresh} />
      ) : (
        data && (
          <>
            {!data.entries.length && (
              <p className="muted">{copy('Записей на этой странице нет.')}</p>
            )}
            {data.entries.map((entry) => (
              <article className="summary-card stack" key={entry.id}>
                <strong style={{ textDecoration: entry.voidedAt ? 'line-through' : undefined }}>
                  {copy(kindLabels[entry.kind])} · {entry.minutes} {copy('мин. ·')}{' '}
                  {money(entry.amountKzt, locale)}
                </strong>
                <p>
                  <span lang="und">{entry.description}</span>
                </p>
                <p className="muted small-text">
                  {copy('Расход:')} {date(entry.occurredAt, true, locale)}
                  {copy('. Записан:')} {date(entry.createdAt, true, locale)}.
                  {entry.projectId && (
                    <>
                      {' '}
                      {copy('Проект:')} {entry.projectId}.
                    </>
                  )}
                </p>
                {entry.voidedAt ? (
                  <p className="muted">
                    {copy('Отменено')} {date(entry.voidedAt, true, locale)}:{' '}
                    <span lang="und">{entry.voidReason}</span>
                  </p>
                ) : voidId === entry.id ? (
                  <form
                    className="stack"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const values = new FormData(event.currentTarget);
                      const result = await action.run(
                        'voidPilotCost',
                        { costId: entry.id, reason: values.get('reason') },
                        'Запись отменена; исходные данные сохранены.',
                      );
                      if (result) setVoidId(null);
                    }}
                  >
                    <label className="field">
                      {copy('Причина отмены')}{' '}
                      <textarea
                        name="reason"
                        required
                        minLength={10}
                        maxLength={1000}
                        disabled={action.busy}
                      />
                    </label>
                    <div className="button-row">
                      <button className="button secondary" disabled={action.busy}>
                        {copy('Подтвердить отмену записи')}
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={action.busy}
                        onClick={() => setVoidId(null)}
                      >
                        {copy('Оставить запись')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="button secondary small"
                    type="button"
                    disabled={action.busy}
                    onClick={() => setVoidId(entry.id)}
                  >
                    {copy('Отменить ошибочную запись')}
                  </button>
                )}
              </article>
            ))}
            <div className="button-row">
              <button
                className="button secondary"
                type="button"
                disabled={page === 1 || loading}
                onClick={() => setPage((current) => current - 1)}
              >
                {copy('Предыдущая страница')}
              </button>
              <span>
                {copy('Страница')} {data.page}
              </span>
              <button
                className="button secondary"
                type="button"
                disabled={!data.hasMore || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                {copy('Следующая страница')}
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
