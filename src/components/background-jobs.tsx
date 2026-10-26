'use client';
import { date } from '@/lib/labels';
import { LoadState, useData } from './platform';

const statuses = {
  completed: 'Завершён',
  busy: 'Пропущен: другой запуск работает',
  failed: 'Ошибка',
};
export function BackgroundJobsPanel() {
  const { data, error, loading, refresh } = useData('backgroundJobs');
  if (!data || error || loading) return <LoadState error={error} retry={refresh} />;
  return (
    <section className="panel stack" aria-label="Фоновая актуальность заданий">
      <h2>Фоновая актуальность заданий</h2>
      <p>
        {data.settings.enabled
          ? 'Запуск worker разрешён конфигурацией.'
          : 'Worker выключен конфигурацией.'}{' '}
        Интервал: {data.settings.intervalMs / 1000} сек.; до {data.settings.batchSize} заданий за
        проход.
      </p>
      <p className="muted small-text">
        История показывает завершённые проходы. Включённая настройка сама по себе не подтверждает,
        что процесс сейчас работает. На выключенном компьютере обработка не выполняется. Просмотр
        этого раздела не запускает задания.
      </p>
      <button className="button secondary" onClick={() => void refresh()}>
        Обновить историю
      </button>
      {!data.runs.length ? (
        <p>Запусков пока нет.</p>
      ) : (
        data.runs.map((run) => (
          <article className="summary-card" key={run.id}>
            <strong>{statuses[run.status]}</strong>
            <p>
              {date(run.startedAt, true)} — {date(run.finishedAt, true)}
            </p>
            <p>
              Рассмотрено: {run.scannedProjects}; срок истёк: {run.expiredProjects}; уведомлений:{' '}
              {run.remindersCreated}.
            </p>
            {run.errorCode && <p className="muted">Код ошибки: {run.errorCode}</p>}
          </article>
        ))
      )}
    </section>
  );
}
