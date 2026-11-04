'use client';
import { useMarketplaceCopy } from './marketplace-copy';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  Info,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { date, lines, money } from '@/lib/labels';
import { localizedCategoryLabels, localizedModeLabels } from '@/lib/localized-labels';
import {
  ActionFeedback,
  DemoBadge,
  LoadState,
  StatusBadge,
  useAction,
  useData,
  useViewer,
} from './platform';
import type { ExternalWork } from './types';
import type { ProfileData } from '@/contracts/api-responses';
import { ProjectViewTracker } from './project-view-tracker';

export function ComplaintForm({
  projectId,
  compact = false,
}: {
  projectId: string;
  compact?: boolean;
}) {
  const { locale, copy } = useMarketplaceCopy();
  const action = useAction();
  return (
    <details className="details-toggle" lang={locale}>
      <summary>{compact ? copy('Сообщить о проблеме') : copy('Пожаловаться на заказ')}</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await action.run(
            'fileComplaint',
            { projectId, reason: f.get('reason') },
            'Жалоба отправлена модератору. Ответ появится в уведомлениях.',
          );
        }}
      >
        <label className="field">
          {copy('Что произошло?')}{' '}
          <textarea
            name="reason"
            required
            minLength={10}
            maxLength={2000}
            placeholder={copy('Опишите проблему без чужих персональных данных')}
          />
        </label>
        <ActionFeedback error={action.error} success={action.success} />
        <button className="button secondary small" disabled={action.busy} type="submit">
          {copy('Отправить жалобу')}
        </button>
      </form>
    </details>
  );
}
export function ProjectDetailScreen({ id }: { id: string }) {
  const { locale, copy } = useMarketplaceCopy();
  const viewer = useViewer();
  const { data, loading, error, refresh } = useData('project', { id });
  const action = useAction(refresh);
  const [works, setWorks] = useState<ExternalWork[]>([]);
  useEffect(() => {
    if (viewer?.roles.includes('student'))
      void fetch('/api/profile')
        .then((r) => r.json())
        .then((body: { data?: ProfileData }) => setWorks(body.data?.externalWorks ?? []))
        .catch(() => setWorks([]));
  }, [viewer]);
  if (loading && !data)
    return (
      <div className="page-shell" lang={locale}>
        <LoadState />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell" lang={locale}>
        <LoadState error={error || 'Заказ не найден'} retry={refresh} />
      </div>
    );
  const p = data.project;
  const owner = viewer?.id === p.clientId;
  const assigned = viewer?.id === p.assignedStudentId;
  const a = data.application;
  const active = a?.status === 'active';
  const draft = ['draft', 'paused'].includes(p.status);
  const canEditApplication = active && p.status === 'published';
  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const selected = f.getAll('work').map(String);
    const extra = lines(f.get('links'));
    await action.run(
      active ? 'updateApplication' : 'applyToProject',
      {
        ...(active ? { applicationId: a!.id } : { projectId: id }),
        message: f.get('message'),
        links: [...new Set([...selected, ...extra])],
      },
      active ? 'Отклик обновлён' : 'Отклик отправлен. Следите за статусом в кабинете.',
    );
  }
  return (
    <div className="page-shell" lang={locale}>
      <ProjectViewTracker
        projectId={id}
        enabled={
          !!viewer &&
          viewer.roles.includes('student') &&
          !viewer.roles.includes('admin') &&
          !viewer.demo &&
          !p.demo &&
          !owner &&
          p.status === 'published' &&
          new Date(p.dueAt) > new Date()
        }
      />
      <Link className="breadcrumb" href="/projects">
        <ArrowLeft size={13} />
        {copy('К каталогу проектов')}
      </Link>
      <div className="split">
        <div className="split-main">
          <div className="detail-top-tags">
            <span className="tag">{localizedCategoryLabels(locale)[p.category] ?? p.category}</span>
            <StatusBadge status={p.status} />
            {p.demo && <DemoBadge />}
          </div>
          <h1 className="detail-title" lang="und">
            {p.title.replace(/^ДЕМО:\s*/i, '')}
          </h1>
          <div className="detail-meta">
            <span>
              <MapPin size={15} />
              {localizedModeLabels(locale)[p.mode]}
              {p.city ? ` · ${p.city}` : ''}
            </span>
            <span>
              <Clock3 size={15} />
              {p.estimatedHours} {copy('ч. работы')}
            </span>
            <span>
              <CalendarDays size={15} /> {copy('До')} {date(p.dueAt, false, locale)}
            </span>
          </div>
          {p.demo && (
            <div className="alert warning">
              <Info size={18} />
              <span>
                {copy(
                  'Демонстрационный пример. Указанные бюджет, заказчик и условия не подтверждают реальный заказ или партнёрство. Публичные отклики на закрытые примеры отключены.',
                )}
              </span>
            </div>
          )}
          {'moderationReason' in p &&
            p.moderationReason &&
            (owner || viewer?.roles.includes('admin')) && (
              <div className="alert warning">
                <Info size={18} />
                <span>
                  <strong>{copy('Комментарий модератора:')}</strong>{' '}
                  <span lang="und">{p.moderationReason}</span>
                </span>
              </div>
            )}
          <section className="panel prose">
            <h2>{copy('Задача')}</h2>
            <p className="pre-wrap" lang="und">
              {p.problem}
            </p>
            <p className="pre-wrap" lang="und">
              {p.description}
            </p>
            <h2>{copy('Ожидаемый результат')}</h2>
            <p className="pre-wrap" lang="und">
              {p.deliverables}
            </p>
            <h2>{copy('Критерии приёмки')}</h2>
            <ol className="criteria-list" lang="und">
              {p.acceptanceCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ol>
            <h2>{copy('Что пригодится')}</h2>
            <div className="tag-row">
              {p.skills.map((skill) => (
                <span className="tag" key={skill} lang="und">
                  {skill}
                </span>
              ))}
              {p.difficulty === 'beginner_friendly' && (
                <span className="tag beginner">{copy('Можно без опыта')}</span>
              )}
            </div>
            <h2>{copy('Формат работы')}</h2>
            <dl className="definition-list">
              <div>
                <dt>{copy('Формат и город')}</dt>
                <dd>
                  {localizedModeLabels(locale)[p.mode]}
                  {p.city ? ` · ${p.city}` : ''}
                </dd>
              </div>
              <div>
                <dt>{copy('Предпочтительное время')}</dt>
                <dd>{p.preferredTime || copy('По согласованию')}</dd>
              </div>
              <div>
                <dt>{copy('Объём')}</dt>
                <dd>
                  {p.estimatedHours} {copy('часов')}
                </dd>
              </div>
              <div>
                <dt>{copy('Расчёт')}</dt>
                <dd>{copy('Фиксированный бюджет')}</dd>
              </div>
            </dl>
          </section>
          {(owner || assigned) &&
            !['draft', 'pending_moderation', 'published', 'paused'].includes(p.status) && (
              <section className="panel">
                <h2>{copy('Совместная работа')}</h2>
                <p className="muted">
                  {copy(
                    'Условия, сдача результата и решения обеих сторон находятся в рабочей области.',
                  )}
                </p>
                <Link className="button" href={`/work/${id}`}>
                  {copy('Открыть рабочую область')} <ArrowRight size={16} />
                </Link>
              </section>
            )}
          {owner && (
            <section className="panel">
              <h2>{copy('Управление заказом')}</h2>
              <div className="button-row">
                {draft && (
                  <>
                    <Link className="button secondary" href={`/client/projects/${id}/edit`}>
                      {copy('Редактировать черновик')}
                    </Link>
                    <button
                      className="button"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(
                          'submitForModeration',
                          { projectId: id },
                          'Заказ отправлен на модерацию',
                        )
                      }
                    >
                      {copy('Отправить на модерацию')}
                    </button>
                  </>
                )}
                {p.status === 'published' && (
                  <>
                    <Link className="button" href={`/client/projects/${id}/applications`}>
                      {copy('Посмотреть отклики')}
                    </Link>
                    <Link className="button secondary" href={`/client/projects/${id}/edit`}>
                      {copy('Изменить и отправить заново')}
                    </Link>
                  </>
                )}
                {p.status === 'pending_moderation' && (
                  <p className="muted">
                    {copy('Заказ проверяет модератор. После решения вы получите уведомление.')}
                  </p>
                )}
              </div>
              {['draft', 'pending_moderation', 'published', 'paused'].includes(p.status) && (
                <details className="details-toggle">
                  <summary>{copy('Приостановить или отменить объявление')}</summary>
                  <form
                    className="stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      const operation = form.get('operation');
                      if (operation !== 'cancelProject' && operation !== 'pauseProject') return;
                      await action.run(
                        operation,
                        { projectId: id, reason: form.get('reason') },
                        'Статус заказа обновлён. История сохранена.',
                      );
                    }}
                  >
                    <label className="field">
                      {copy('Действие')}{' '}
                      <select name="operation" defaultValue="cancelProject">
                        <option value="cancelProject">{copy('Отменить заказ')}</option>
                        {['published', 'pending_moderation'].includes(p.status) && (
                          <option value="pauseProject">{copy('Приостановить объявление')}</option>
                        )}
                      </select>
                    </label>
                    <label className="field">
                      {copy('Причина')}{' '}
                      <textarea name="reason" required minLength={10} maxLength={2000} />
                    </label>
                    <button className="button danger" disabled={action.busy}>
                      {copy('Подтвердить изменение статуса')}
                    </button>
                  </form>
                </details>
              )}
              <ActionFeedback error={action.error} success={action.success} />
            </section>
          )}
          {viewer && !owner && <ComplaintForm projectId={id} />}
        </div>
        <aside className="sticky-aside detail-aside">
          <section className="panel">
            <span className="budget-label">{copy('Фиксированный бюджет')}</span>
            <div className="detail-budget">{money(p.budgetKzt, locale)}</div>
            <p className="muted small-text">{copy('За весь согласованный результат')}</p>
            <dl className="definition-list">
              <div>
                <dt>{copy('Время на задачу')}</dt>
                <dd>
                  {p.estimatedHours} {copy('часов')}
                </dd>
              </div>
              <div>
                <dt>{copy('Сдать до')}</dt>
                <dd>{date(p.dueAt, false, locale)}</dd>
              </div>
              <div>
                <dt>{copy('Уровень')}</dt>
                <dd>
                  {p.difficulty === 'beginner_friendly'
                    ? copy('Подходит для первого опыта')
                    : copy('Нужен базовый опыт')}
                </dd>
              </div>
            </dl>
            {!viewer ? (
              <>
                <Link className="button full" href="/auth/register">
                  {copy('Откликнуться бесплатно')} <ArrowRight size={16} />
                </Link>
                <p className="small-text muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  {copy('Войдите или создайте профиль исполнителя.')}
                </p>
              </>
            ) : !owner && !assigned && !viewer.roles.includes('student') ? (
              <Link className="button full" href="/onboarding">
                {copy('Добавить роль исполнителя')}
              </Link>
            ) : null}
            {a && (
              <div style={{ marginBottom: 16 }}>
                <p className="small-text muted">{copy('Ваш отклик')}</p>
                <StatusBadge status={a.status} />
              </div>
            )}
            {(data.canApply || canEditApplication) && (
              <form className="action-form stack" onSubmit={apply}>
                <label className="field">
                  {active ? copy('Ваше сообщение') : copy('Коротко о себе и подходе')}
                  <textarea
                    name="message"
                    required
                    minLength={20}
                    maxLength={2000}
                    defaultValue={a?.message ?? ''}
                    placeholder={copy('Почему вам интересна задача и как вы её решите?')}
                  />
                </label>
                {works.length > 0 && (
                  <div className="field">
                    <span>{copy('Релевантные работы (необязательно)')}</span>
                    {works.map((work) => (
                      <label className="check-label" key={work.id}>
                        <input type="checkbox" name="work" value={work.url} />
                        <span>
                          <span lang="und">{work.title}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <label className="field">
                  {copy('Ссылки на работы (необязательно)')}{' '}
                  <textarea
                    name="links"
                    maxLength={2000}
                    defaultValue={a?.links.join('\n') ?? ''}
                    placeholder={copy('https://… — одна ссылка на строку')}
                    rows={2}
                  />
                  <small>
                    {copy('Не больше 5 ссылок. Первый заказ можно получить без портфолио.')}
                  </small>
                </label>
                <button className="button full" type="submit" disabled={action.busy}>
                  {action.busy
                    ? copy('Сохраняем…')
                    : active
                      ? copy('Обновить отклик')
                      : copy('Отправить отклик бесплатно')}
                </button>
                {canEditApplication && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={action.busy}
                    onClick={() =>
                      action.run('withdrawApplication', { applicationId: a!.id }, 'Отклик отозван')
                    }
                  >
                    {copy('Отозвать отклик')}
                  </button>
                )}
              </form>
            )}
            {!data.canApply &&
              !canEditApplication &&
              !owner &&
              !assigned &&
              viewer?.roles.includes('student') &&
              !a && (
                <div className="alert warning">{copy('Отклики на этот заказ сейчас закрыты.')}</div>
              )}
            {!owner && <ActionFeedback error={action.error} success={action.success} />}
            <div className="divider" />
            <p className="small-text muted" style={{ marginBottom: 0 }}>
              {copy(
                'Оплата проходит напрямую между участниками. Платформа не удерживает деньги и не гарантирует выплату.',
              )}
            </p>
          </section>
          <section className="panel">
            <div className="client-block">
              <span className="avatar">
                {(p.client?.clientProfile?.name ?? p.client?.name ?? copy('З')).slice(0, 1)}
              </span>
              <div>
                <strong>
                  {p.client?.clientProfile?.name ?? p.client?.name ?? copy('Заказчик')}
                </strong>
                <small>
                  {p.client?.clientProfile?.verificationStatus === 'verified' ? (
                    <>
                      <ShieldCheck
                        size={12}
                        style={{ display: 'inline', verticalAlign: 'middle' }}
                      />{' '}
                      {copy('Проверен модератором')}{' '}
                    </>
                  ) : (
                    copy('Проверка организации не завершена')
                  )}
                </small>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
