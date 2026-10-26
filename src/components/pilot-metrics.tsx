'use client';
import { LoadState, useData } from './platform';
import { date } from '@/lib/labels';

export function PilotMetricsPanel() {
  const { data, error, loading, refresh } = useData('pilotMetrics');
  if (!data || loading || error) return <LoadState error={error} retry={refresh} />;
  return (
    <section className="panel stack" aria-label="Результаты пилота">
      <h2>Путь реальных проектов</h2>
      <p>
        Одна задача учитывается один раз на каждом этапе, даже после повторной публикации или сдачи.
        База долей — все когда-либо одобренные реальные проекты. Отмены остаются в базе. Демо-заказы
        и проекты с демо-участниками исключены.
      </p>
      <div className="stack">
        {data.stages.map((stage) => (
          <div key={stage.id} className="summary-card">
            <strong>{stage.count}</strong>
            <p>{stage.label}</p>
            <span className="muted small-text">
              {stage.shareOfPublished === null
                ? 'Нет базы для расчёта доли'
                : `${(stage.shareOfPublished * 100).toFixed(1)}% опубликованных`}
            </span>
          </div>
        ))}
      </div>
      <p>
        Студентов с первым принятым оплаченным проектом: {data.firstPaidStudents}. Заказчиков с
        двумя и более такими проектами: {data.repeatClients}.
      </p>
      <p>
        Текущие споры: {data.disputed}. Отменённые проекты: {data.cancelled}.
      </p>
      <h3>Измеренные просмотры и отклики</h3>
      <p>
        {data.engagement.startedAt
          ? `Сбор начат ${date(data.engagement.startedAt, true)}.`
          : 'Сбор просмотров ещё не инициализирован.'}{' '}
        Учитываются только авторизованные студенты: один первый просмотр на пару студент–проект.
        Гости, автор, администраторы и ДЕМО не входят в измерение.
      </p>
      <p>
        Измеренных пар: {data.views ?? 'нет измерения'}. Отклик после просмотра:{' '}
        {data.engagement.appliedPairs}. Конверсия:{' '}
        {data.engagement.conversionRate === null
          ? 'нет базы для расчёта'
          : `${(data.engagement.conversionRate * 100).toFixed(1)}%`}
        . Просмотренных проектов: {data.engagement.viewedProjects}.
      </p>
      <h3>Повтор за 30 дней</h3>
      <p>
        Завершённых окон: {data.repeat30Days.matureClients}. Ещё наблюдаются:{' '}
        {data.repeat30Days.immatureClients}. Повторно оплатили в завершённых окнах:{' '}
        {data.repeat30Days.repeatClients}. Доля:{' '}
        {data.repeat30Days.repeatRate === null
          ? 'нет завершённых окон наблюдения'
          : `${(data.repeat30Days.repeatRate * 100).toFixed(1)}%`}
        .
      </p>
      {data.repeat30Days.undatedClients > 0 && (
        <p className="muted small-text">
          Без надёжной истории дат: {data.repeat30Days.undatedClients} заказчиков. Они исключены из
          знаменателя повторов.
        </p>
      )}
      {data.repeat30Days.cohorts.length > 0 && (
        <div className="stack">
          {data.repeat30Days.cohorts.map((cohort) => (
            <div className="summary-card" key={cohort.month}>
              <strong>{cohort.month}</strong>
              <p>
                Зрелых окон: {cohort.matureClients}; наблюдаются: {cohort.immatureClients};
                повторов: {cohort.repeatClients}.
              </p>
              <span className="muted small-text">
                {cohort.repeatRate === null
                  ? 'Нет зрелой базы'
                  : `${(cohort.repeatRate * 100).toFixed(1)}% зрелых заказчиков`}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="muted small-text">
        Историческая воронка считает проекты, а конверсия просмотра — пары студент–проект с
        измеренным просмотром. Окно повтора начинается с первого принятого проекта с двумя
        заявлениями оплаты; незавершённые окна не считаются неудачами. Оплата — заявления сторон, не
        банковская сверка. Отозванный отклик остаётся фактом отклика. Срез: {date(data.asOf, true)}.
      </p>
    </section>
  );
}
