'use client';
import { useMarketplaceCopy } from './marketplace-copy';
import { LoadState, useData } from './platform';
import { date } from '@/lib/labels';

export function PilotMetricsPanel() {
  const { locale, copy } = useMarketplaceCopy();
  const { data, error, loading, refresh } = useData('pilotMetrics');
  if (!data || loading || error) return <LoadState error={error} retry={refresh} />;
  return (
    <section lang={locale} className="panel stack" aria-label={copy('Результаты пилота')}>
      <h2>{copy('Путь реальных проектов')}</h2>
      <p>
        {copy(
          'Одна задача учитывается один раз на каждом этапе, даже после повторной публикации или сдачи. База долей — все когда-либо одобренные реальные проекты. Отмены остаются в базе. Демо-заказы и проекты с демо-участниками исключены.',
        )}
      </p>
      <div className="stack">
        {data.stages.map((stage) => (
          <div key={stage.id} className="summary-card">
            <strong>{stage.count}</strong>
            <p>{copy(stage.label)}</p>
            <span className="muted small-text">
              {stage.shareOfPublished === null
                ? copy('Нет базы для расчёта доли')
                : `${(stage.shareOfPublished * 100).toFixed(1)}% ${locale === 'kk' ? 'жарияланғандардың' : 'опубликованных'}`}
            </span>
          </div>
        ))}
      </div>
      <p>
        {copy('Студентов с первым принятым оплаченным проектом:')} {data.firstPaidStudents}
        {copy('. Заказчиков с двумя и более такими проектами:')} {data.repeatClients}.
      </p>
      <p>
        {copy('Текущие споры:')} {data.disputed}
        {copy('. Отменённые проекты:')} {data.cancelled}.
      </p>
      <h3>{copy('Измеренные просмотры и отклики')}</h3>
      <p>
        {data.engagement.startedAt
          ? `${locale === 'kk' ? 'Жинау басталған күн:' : 'Сбор начат'} ${date(data.engagement.startedAt, true, locale)}.`
          : copy('Сбор просмотров ещё не инициализирован.')}{' '}
        {copy(
          'Учитываются только авторизованные студенты: один первый просмотр на пару студент–проект. Гости, автор, администраторы и ДЕМО не входят в измерение.',
        )}
      </p>
      <p>
        {copy('Измеренных пар:')} {data.views ?? copy('нет измерения')}
        {copy('. Отклик после просмотра:')} {data.engagement.appliedPairs}
        {copy('. Конверсия:')}{' '}
        {data.engagement.conversionRate === null
          ? copy('нет базы для расчёта')
          : `${(data.engagement.conversionRate * 100).toFixed(1)}%`}{' '}
        {copy('. Просмотренных проектов:')} {data.engagement.viewedProjects}.
      </p>
      <h3>{copy('Повтор за 30 дней')}</h3>
      <p>
        {copy('Завершённых окон:')} {data.repeat30Days.matureClients}
        {copy('. Ещё наблюдаются:')} {data.repeat30Days.immatureClients}
        {copy('. Повторно оплатили в завершённых окнах:')} {data.repeat30Days.repeatClients}
        {copy('. Доля:')}{' '}
        {data.repeat30Days.repeatRate === null
          ? copy('нет завершённых окон наблюдения')
          : `${(data.repeat30Days.repeatRate * 100).toFixed(1)}%`}
        .
      </p>
      {data.repeat30Days.undatedClients > 0 && (
        <p className="muted small-text">
          {copy('Без надёжной истории дат:')} {data.repeat30Days.undatedClients}{' '}
          {copy('заказчиков. Они исключены из знаменателя повторов.')}
        </p>
      )}
      {data.repeat30Days.cohorts.length > 0 && (
        <div className="stack">
          {data.repeat30Days.cohorts.map((cohort) => (
            <div className="summary-card" key={cohort.month}>
              <strong>{cohort.month}</strong>
              <p>
                {copy('Зрелых окон:')} {cohort.matureClients}
                {copy('; наблюдаются:')} {cohort.immatureClients}
                {copy('; повторов:')} {cohort.repeatClients}.
              </p>
              <span className="muted small-text">
                {cohort.repeatRate === null
                  ? copy('Нет зрелой базы')
                  : `${(cohort.repeatRate * 100).toFixed(1)}% ${locale === 'kk' ? 'бақылауы аяқталған тапсырыс берушілердің' : 'зрелых заказчиков'}`}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="muted small-text">
        {copy(
          'Историческая воронка считает проекты, а конверсия просмотра — пары студент–проект с измеренным просмотром. Окно повтора начинается с первого принятого проекта с двумя заявлениями оплаты; незавершённые окна не считаются неудачами. Оплата — заявления сторон, не банковская сверка. Отозванный отклик остаётся фактом отклика. Срез:',
        )}{' '}
        {date(data.asOf, true, locale)}.
      </p>
    </section>
  );
}
