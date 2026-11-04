'use client';
import { useMarketplaceCopy } from './marketplace-copy';
import Link from 'next/link';
import { useId, useState } from 'react';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { date, money } from '@/lib/labels';
import {
  ActionFeedback,
  DemoBadge,
  EmptyState,
  LoadState,
  PageHeading,
  StatusBadge,
  useAction,
  useData,
  useViewer,
  WorkspaceNav,
} from './platform';
import type { Project } from './types';
import { LeadHandoffsPanel } from './lead-handoffs';
import { NotificationLanguageSettings } from './notification-language-settings';

function ProjectRow({ project, client = false }: { project: Project; client?: boolean }) {
  const { locale, copy } = useMarketplaceCopy();
  const work = [
    'assigned',
    'in_progress',
    'submitted',
    'changes_requested',
    'accepted',
    'completed',
    'disputed',
  ].includes(project.status);
  return (
    <article className="project-row">
      <div>
        <Link className="row-title" lang="und" href={`/projects/${project.id}`}>
          {project.title}
        </Link>
        <div className="row-meta">
          <span>{money(project.budgetKzt, locale)}</span>
          <span>
            {project.estimatedHours} {copy('ч.')}
          </span>
          <span>
            {copy('До')} {date(project.dueAt, false, locale)}
          </span>
          {project.demo && <DemoBadge />}
        </div>
      </div>
      <div className="row-actions">
        <StatusBadge status={project.status} />
        <Link
          className="button secondary small"
          href={
            work
              ? `/work/${project.id}`
              : client && project.status === 'published'
                ? `/client/projects/${project.id}/applications`
                : `/projects/${project.id}`
          }
        >
          {work
            ? copy('К работе')
            : client && project.status === 'published'
              ? copy('Отклики')
              : copy('Открыть')}
          <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}
export function DashboardScreen({
  view = 'overview',
}: {
  view?: 'overview' | 'applications' | 'studentProjects' | 'clientProjects';
}) {
  const { locale, copy } = useMarketplaceCopy();
  const viewer = useViewer();
  const { data, error, loading, refresh } = useData('dashboard');
  const action = useAction(refresh);
  const notificationsId = useId();
  const [allNotifications, setAllNotifications] = useState(false);
  const active =
    view === 'applications'
      ? '/student/applications'
      : view === 'studentProjects'
        ? '/student/projects'
        : view === 'clientProjects'
          ? '/client/projects'
          : '/dashboard';
  if (loading && !data)
    return (
      <div className="page-shell" lang={locale}>
        <LoadState />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell" lang={locale}>
        <LoadState error={error} retry={refresh} />
      </div>
    );
  const projects = data.projects ?? [];
  const applications = data.applications ?? [];
  const notifications = data.notifications ?? [];
  const client =
    view === 'clientProjects' ||
    (view === 'overview' && !viewer?.roles.includes('student') && viewer?.roles.includes('client'));
  const ownProjects = client
    ? projects.filter((p) => p.clientId === viewer?.id)
    : projects.filter((p) => p.assignedStudentId === viewer?.id);
  const inProgress = ownProjects.filter((p) =>
    ['assigned', 'in_progress', 'submitted', 'changes_requested'].includes(p.status),
  );
  const titles = {
    overview: `${copy('Привет,')} ${data.user.name.split(' ')[0]}`,
    applications: copy('Мои отклики'),
    studentProjects: copy('Мои проекты'),
    clientProjects: copy('Мои заказы'),
  };
  return (
    <div className="page-shell" lang={locale}>
      <PageHeading
        eyebrow={client ? copy('Кабинет заказчика') : copy('Личный кабинет')}
        title={titles[view]}
        action={
          viewer?.roles.includes('client') ? (
            <Link className="button" href="/client/projects/new">
              <Plus size={17} /> {copy('Разместить заказ')}
            </Link>
          ) : (
            <Link className="button" href="/projects">
              {copy('Найти проект')} <ArrowRight size={16} />
            </Link>
          )
        }
      >
        {view === 'applications'
          ? copy(
              'Здесь видно, что происходит с каждым откликом. До выбора исполнителя сообщение можно изменить.',
            )
          : view === 'overview'
            ? copy('Всё, что важно для следующего шага: проекты, отклики и решения заказчиков.')
            : copy('От согласования условий до подтверждённого результата.')}
      </PageHeading>
      <WorkspaceNav active={active} />
      <p>
        <Link href="/opportunities/saved" className="text-link">
          {copy('Моё избранное и поиски возможностей →')}
        </Link>
      </p>
      {view === 'clientProjects' && <LeadHandoffsPanel />}
      <ActionFeedback error={action.error} success={action.success} />
      {!data.user.roles.length && (
        <div className="alert">
          <span>
            {copy('Сначала выберите роль и заполните базовый профиль.')}{' '}
            <Link className="text-link" href="/onboarding">
              {copy('Начать →')}
            </Link>
          </span>
        </div>
      )}
      {view === 'overview' && (
        <div className="summary-grid">
          <div className="summary-card">
            <div>
              <strong>{inProgress.length}</strong>
              <p>{copy('Проектов требуют внимания')}</p>
            </div>
            <span className="summary-icon">
              <BriefcaseBusiness size={19} />
            </span>
          </div>
          <div className="summary-card">
            <div>
              <strong>
                {client
                  ? ownProjects.filter((p) => p.status === 'published').length
                  : applications.filter((a) => a.status === 'active').length}
              </strong>
              <p>{client ? copy('Опубликованных заказов') : copy('Откликов на рассмотрении')}</p>
            </div>
            <span className="summary-icon">
              <MessageSquare size={19} />
            </span>
          </div>
          <div className="summary-card">
            <div>
              <strong>{ownProjects.filter((p) => p.status === 'completed').length}</strong>
              <p>{copy('Заказов закрыто обеими сторонами')}</p>
            </div>
            <span className="summary-icon">
              <CheckCircle2 size={19} />
            </span>
          </div>
        </div>
      )}
      {view === 'applications' ? (
        applications.length ? (
          <section className="panel row-list">
            {applications.map((a) => (
              <article className="project-row" key={a.id}>
                <div>
                  <Link
                    className="row-title"
                    lang={a.project?.title ? 'und' : locale}
                    href={`/projects/${a.projectId}`}
                  >
                    {a.project?.title ?? copy('Заказ')}
                  </Link>
                  <p className="muted small-text pre-wrap" lang="und" style={{ margin: '8px 0' }}>
                    {a.message}
                  </p>
                  <div className="row-meta">
                    <span>
                      {copy('Отправлен')} {date(a.createdAt, false, locale)}
                    </span>
                    {a.project?.demo && <DemoBadge />}
                  </div>
                </div>
                <div className="row-actions">
                  <StatusBadge status={a.status} />
                  <Link
                    className="button secondary small"
                    href={
                      a.status === 'selected' ? `/work/${a.projectId}` : `/projects/${a.projectId}`
                    }
                  >
                    {a.status === 'selected' ? copy('К работе') : copy('Подробнее')}
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <EmptyState
            title={copy('Начните с первого отклика')}
            href="/projects"
            action={copy('Выбрать проект')}
          >
            {copy('Длинное резюме не нужно. Расскажите, чем можете помочь с конкретной задачей.')}
          </EmptyState>
        )
      ) : (
        <div className={view === 'overview' ? 'split' : ''}>
          <section className="split-main">
            <div className="section-title">
              <h2>
                {view === 'overview'
                  ? copy('Текущие проекты')
                  : client
                    ? copy('Все ваши заказы')
                    : copy('Выбранные проекты')}
              </h2>
              {view === 'overview' && (
                <Link
                  className="text-link small-text"
                  href={client ? '/client/projects' : '/student/projects'}
                >
                  {copy('Все →')}
                </Link>
              )}
            </div>
            {ownProjects.length ? (
              <div className="panel row-list">
                {(view === 'overview' ? ownProjects.slice(0, 5) : ownProjects).map((p) => (
                  <ProjectRow project={p} client={Boolean(client)} key={p.id} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={
                  client
                    ? copy('Дайте идее конкретную задачу')
                    : copy('Здесь будет ваша первая работа')
                }
                href={client ? '/client/projects/new' : '/projects'}
                action={client ? copy('Создать заказ') : copy('Посмотреть проекты')}
              >
                {client
                  ? copy(
                      'Укажите бюджет, результат и критерии приёмки. После модерации студенты смогут откликнуться.',
                    )
                  : copy(
                      'Откликнитесь на проект. После выбора заказчиком здесь появятся условия и рабочая область.',
                    )}
              </EmptyState>
            )}
            {view === 'overview' && !client && (data.portfolio ?? []).length > 0 && (
              <section className="panel" style={{ marginTop: 22 }}>
                <h2>{copy('Подтверждённое портфолио')}</h2>
                {data.portfolio.map((item) => (
                  <article className="project-row" key={item.id}>
                    <div>
                      <strong className="row-title" lang="und">
                        {item.title}
                      </strong>
                      <p className="muted small-text" style={{ margin: '6px 0 0' }}>
                        {item.visibility === 'private'
                          ? copy('Приватная запись')
                          : item.clientConsentAt && item.studentConsentAt
                            ? copy('Видимость согласована обеими сторонами')
                            : copy('Ожидает согласования публичной видимости')}
                      </p>
                    </div>
                    <Link className="text-link small-text" href={`/work/${item.projectId}`}>
                      {copy('Настроить →')}
                    </Link>
                  </article>
                ))}
              </section>
            )}
          </section>
          {view === 'overview' && (
            <aside>
              <section className="panel" aria-label={copy('Уведомления')}>
                <div className="section-title">
                  <h2 style={{ fontSize: 18 }}>{copy('Уведомления')}</h2>
                  <FileText size={17} className="muted" />
                </div>
                <p className="muted small-text">
                  {copy('Здесь доступны последние 30 уведомлений.')}
                </p>
                <NotificationLanguageSettings />
                <div id={notificationsId}>
                  {notifications.length ? (
                    notifications.slice(0, allNotifications ? notifications.length : 8).map((n) => (
                      <article className={`notification ${!n.readAt ? 'unread' : ''}`} key={n.id}>
                        <p lang="und">{n.text}</p>
                        <div className="button-row">
                          <time>{date(n.createdAt, true, locale)}</time>
                          {n.url && (
                            <Link className="text-link small-text" href={n.url}>
                              {copy('Открыть')}
                            </Link>
                          )}
                          {!n.readAt && (
                            <button
                              className="text-link small-text"
                              style={{ border: 0, background: 'none', padding: 0 }}
                              disabled={action.busy}
                              onClick={() =>
                                action.run('markNotification', { notificationId: n.id }, '')
                              }
                            >
                              {copy('Прочитано')}
                            </button>
                          )}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="muted small-text" style={{ margin: 0 }}>
                      {copy('Важные решения и изменения появятся здесь.')}
                    </p>
                  )}
                </div>
                {notifications.length > 8 && (
                  <button
                    type="button"
                    className="button secondary small"
                    aria-expanded={allNotifications}
                    aria-controls={notificationsId}
                    onClick={() => setAllNotifications((current) => !current)}
                  >
                    {allNotifications
                      ? copy('Свернуть уведомления')
                      : `${copy('Показать все загруженные уведомления')} (${notifications.length})`}
                  </button>
                )}
              </section>
              <section className="panel">
                <h2 style={{ fontSize: 18 }}>{copy('Следующий шаг')}</h2>
                <p className="small-text muted">
                  {client
                    ? copy(
                        'Хорошая задача — это ограниченный объём, понятный результат и честные условия.',
                      )
                    : copy(
                        'Добавьте навыки и удобный формат работы. Опыт и отзывы не обязательны для первого отклика.',
                      )}
                </p>
                <Link className="text-link small-text" href={client ? '/help' : '/student/profile'}>
                  {client ? copy('Памятка заказчику') : copy('Заполнить профиль')} →
                </Link>
              </section>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
