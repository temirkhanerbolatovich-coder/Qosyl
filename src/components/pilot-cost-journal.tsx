'use client';
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
    <section className="panel stack" aria-label="Журнал затрат пилота">
      <h2>Журнал затрат пилота</h2>
      <p className="muted small-text">
        Время команды и денежные расходы учитываются отдельно за всю историю журнала. Стоимость часа
        и доход площадки автоматически не предполагаются. Не записывайте контакты, реквизиты и
        другие персональные данные в описание.
      </p>
      {data && (
        <p>
          Учтено: {data.totals.minutes} мин. и {money(data.totals.amountKzt)} в{' '}
          {data.totals.entries} записях. Отменено: {data.totals.voidedEntries}.
        </p>
      )}
      <ActionFeedback error={action.error} success={action.success} />
      <form ref={form} className="stack" onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            Категория расхода
            <select name="kind" defaultValue="moderation" disabled={action.busy}>
              {Object.entries(kindLabels).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Дата и время расхода (время устройства)
            <input name="occurredAt" type="datetime-local" required disabled={action.busy} />
          </label>
          <label className="field">
            Время команды, минут
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
            Денежный расход, ₸
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
          ID реального проекта (необязательно)
          <input name="projectId" maxLength={100} disabled={action.busy} />
        </label>
        <label className="field">
          Описание расхода
          <textarea
            name="description"
            minLength={3}
            maxLength={1000}
            required
            disabled={action.busy}
            placeholder="Например, проверка брифа и критериев приёмки"
          />
        </label>
        <p className="muted small-text">
          Если ответ потерян, повторите сохранение с теми же полями. Ключ запроса сохраняется до
          подтверждения. Перед созданием другой записи обновите журнал и проверьте результат.
        </p>
        <div className="button-row">
          <button className="button" type="submit" disabled={action.busy}>
            Сохранить расход
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
            Новая запись
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={action.busy}
            onClick={() => void refresh()}
          >
            Обновить журнал
          </button>
        </div>
      </form>
      {error || loading ? (
        <LoadState error={error} retry={refresh} />
      ) : (
        data && (
          <>
            {!data.entries.length && <p className="muted">Записей на этой странице нет.</p>}
            {data.entries.map((entry) => (
              <article className="summary-card stack" key={entry.id}>
                <strong style={{ textDecoration: entry.voidedAt ? 'line-through' : undefined }}>
                  {kindLabels[entry.kind]} · {entry.minutes} мин. · {money(entry.amountKzt)}
                </strong>
                <p>{entry.description}</p>
                <p className="muted small-text">
                  Расход: {date(entry.occurredAt, true)}. Записан: {date(entry.createdAt, true)}.
                  {entry.projectId && <> Проект: {entry.projectId}.</>}
                </p>
                {entry.voidedAt ? (
                  <p className="muted">
                    Отменено {date(entry.voidedAt, true)}: {entry.voidReason}
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
                      Причина отмены
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
                        Подтвердить отмену записи
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={action.busy}
                        onClick={() => setVoidId(null)}
                      >
                        Оставить запись
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
                    Отменить ошибочную запись
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
                Предыдущая страница
              </button>
              <span>Страница {data.page}</span>
              <button
                className="button secondary"
                type="button"
                disabled={!data.hasMore || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Следующая страница
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
