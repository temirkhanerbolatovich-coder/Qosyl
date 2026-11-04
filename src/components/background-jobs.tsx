'use client';
import { useMarketplaceCopy } from './marketplace-copy';
import { date } from '@/lib/labels';
import { LoadState, useData } from './platform';

const statuses = {
  completed: 'Завершён',
  busy: 'Пропущен: другой запуск работает',
  failed: 'Ошибка',
};
export function BackgroundJobsPanel() {
  const { locale, copy } = useMarketplaceCopy();
  const { data, error, loading, refresh } = useData('backgroundJobs');
  if (!data || error || loading) return <LoadState error={error} retry={refresh} />;
  return (
    <section
      lang={locale}
      className="panel stack"
      aria-label={copy('Фоновая актуальность заданий')}
    >
      <h2>{copy('Фоновая актуальность заданий')}</h2>
      <p>
        {data.settings.enabled
          ? copy('Запуск worker разрешён конфигурацией.')
          : copy('Worker выключен конфигурацией.')}{' '}
        {copy('Интервал:')} {data.settings.intervalMs / 1000} {copy('сек.; до')}{' '}
        {data.settings.batchSize} {copy('заданий за проход.')}
      </p>
      <p className="muted small-text">
        {copy(
          'История показывает завершённые проходы. Включённая настройка сама по себе не подтверждает, что процесс сейчас работает. На выключенном компьютере обработка не выполняется. Просмотр этого раздела не запускает задания.',
        )}
      </p>
      <button className="button secondary" onClick={() => void refresh()}>
        {copy('Обновить историю')}
      </button>
      {!data.runs.length ? (
        <p>{copy('Запусков пока нет.')}</p>
      ) : (
        data.runs.map((run) => (
          <article className="summary-card" key={run.id}>
            <strong>{copy(statuses[run.status])}</strong>
            <p>
              {date(run.startedAt, true, locale)} — {date(run.finishedAt, true, locale)}
            </p>
            <p>
              {copy('Рассмотрено:')} {run.scannedProjects}
              {copy('; срок истёк:')} {run.expiredProjects}
              {copy('; уведомлений:')} {run.remindersCreated}.
            </p>
            {run.errorCode && (
              <p className="muted">
                {copy('Код ошибки:')} {run.errorCode}
              </p>
            )}
          </article>
        ))
      )}
    </section>
  );
}
