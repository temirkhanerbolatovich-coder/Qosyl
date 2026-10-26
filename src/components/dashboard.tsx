'use client';
import Link from 'next/link';
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

function ProjectRow({ project, client = false }: { project: Project; client?: boolean }) {
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
        <Link className="row-title" href={`/projects/${project.id}`}>
          {project.title}
        </Link>
        <div className="row-meta">
          <span>{money(project.budgetKzt)}</span>
          <span>{project.estimatedHours} ч.</span>
          <span>До {date(project.dueAt)}</span>
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
          {work ? 'К работе' : client && project.status === 'published' ? 'Отклики' : 'Открыть'}
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
  const viewer = useViewer();
  const { data, error, loading, refresh } = useData('dashboard');
  const action = useAction(refresh);
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
      <div className="page-shell">
        <LoadState />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell">
        <LoadState error={error} retry={refresh} />
      </div>
    );
  const projects = data.projects ?? [];
  const applications = data.applications ?? [];
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
    overview: `Привет, ${data.user.name.split(' ')[0]}`,
    applications: 'Мои отклики',
    studentProjects: 'Мои проекты',
    clientProjects: 'Мои заказы',
  };
  return (
    <div className="page-shell">
      <PageHeading
        eyebrow={client ? 'Кабинет заказчика' : 'Личный кабинет'}
        title={titles[view]}
        action={
          viewer?.roles.includes('client') ? (
            <Link className="button" href="/client/projects/new">
              <Plus size={17} />
              Разместить заказ
            </Link>
          ) : (
            <Link className="button" href="/projects">
              Найти проект
              <ArrowRight size={16} />
            </Link>
          )
        }
      >
        {view === 'applications'
          ? 'Здесь видно, что происходит с каждым откликом. До выбора исполнителя сообщение можно изменить.'
          : view === 'overview'
            ? 'Всё, что важно для следующего шага: проекты, отклики и решения заказчиков.'
            : 'От согласования условий до подтверждённого результата.'}
      </PageHeading>
      <WorkspaceNav active={active} />
      {view === 'clientProjects' && <LeadHandoffsPanel />}
      <ActionFeedback error={action.error} success={action.success} />
      {!data.user.roles.length && (
        <div className="alert">
          <span>
            Сначала выберите роль и заполните базовый профиль.{' '}
            <Link className="text-link" href="/onboarding">
              Начать →
            </Link>
          </span>
        </div>
      )}
      {view === 'overview' && (
        <div className="summary-grid">
          <div className="summary-card">
            <div>
              <strong>{inProgress.length}</strong>
              <p>Проектов требуют внимания</p>
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
              <p>{client ? 'Опубликованных заказов' : 'Откликов на рассмотрении'}</p>
            </div>
            <span className="summary-icon">
              <MessageSquare size={19} />
            </span>
          </div>
          <div className="summary-card">
            <div>
              <strong>{ownProjects.filter((p) => p.status === 'completed').length}</strong>
              <p>Заказов закрыто обеими сторонами</p>
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
                  <Link className="row-title" href={`/projects/${a.projectId}`}>
                    {a.project?.title ?? 'Заказ'}
                  </Link>
                  <p className="muted small-text pre-wrap" style={{ margin: '8px 0' }}>
                    {a.message}
                  </p>
                  <div className="row-meta">
                    <span>Отправлен {date(a.createdAt)}</span>
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
                    {a.status === 'selected' ? 'К работе' : 'Подробнее'}
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <EmptyState title="Начните с первого отклика" href="/projects" action="Выбрать проект">
            Длинное резюме не нужно. Расскажите, чем можете помочь с конкретной задачей.
          </EmptyState>
        )
      ) : (
        <div className={view === 'overview' ? 'split' : ''}>
          <section className="split-main">
            <div className="section-title">
              <h2>
                {view === 'overview'
                  ? 'Текущие проекты'
                  : client
                    ? 'Все ваши заказы'
                    : 'Выбранные проекты'}
              </h2>
              {view === 'overview' && (
                <Link
                  className="text-link small-text"
                  href={client ? '/client/projects' : '/student/projects'}
                >
                  Все →
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
                title={client ? 'Дайте идее конкретную задачу' : 'Здесь будет ваша первая работа'}
                href={client ? '/client/projects/new' : '/projects'}
                action={client ? 'Создать заказ' : 'Посмотреть проекты'}
              >
                {client
                  ? 'Укажите бюджет, результат и критерии приёмки. После модерации студенты смогут откликнуться.'
                  : 'Откликнитесь на проект. После выбора заказчиком здесь появятся условия и рабочая область.'}
              </EmptyState>
            )}
            {view === 'overview' && !client && (data.portfolio ?? []).length > 0 && (
              <section className="panel" style={{ marginTop: 22 }}>
                <h2>Подтверждённое портфолио</h2>
                {data.portfolio.map((item) => (
                  <article className="project-row" key={item.id}>
                    <div>
                      <strong className="row-title">{item.title}</strong>
                      <p className="muted small-text" style={{ margin: '6px 0 0' }}>
                        {item.visibility === 'private'
                          ? 'Приватная запись'
                          : item.clientConsentAt && item.studentConsentAt
                            ? 'Видимость согласована обеими сторонами'
                            : 'Ожидает согласования публичной видимости'}
                      </p>
                    </div>
                    <Link className="text-link small-text" href={`/work/${item.projectId}`}>
                      Настроить →
                    </Link>
                  </article>
                ))}
              </section>
            )}
          </section>
          {view === 'overview' && (
            <aside>
              <section className="panel">
                <div className="section-title">
                  <h2 style={{ fontSize: 18 }}>Уведомления</h2>
                  <FileText size={17} className="muted" />
                </div>
                {(data.notifications ?? []).length ? (
                  data.notifications.slice(0, 8).map((n) => (
                    <article className={`notification ${!n.readAt ? 'unread' : ''}`} key={n.id}>
                      <p>{n.text}</p>
                      <div className="button-row">
                        <time>{date(n.createdAt, true)}</time>
                        {n.url && (
                          <Link className="text-link small-text" href={n.url}>
                            Открыть
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
                            Прочитано
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="muted small-text" style={{ margin: 0 }}>
                    Важные решения и изменения появятся здесь.
                  </p>
                )}
              </section>
              <section className="panel">
                <h2 style={{ fontSize: 18 }}>Следующий шаг</h2>
                <p className="small-text muted">
                  {client
                    ? 'Хорошая задача — это ограниченный объём, понятный результат и честные условия.'
                    : 'Добавьте навыки и удобный формат работы. Опыт и отзывы не обязательны для первого отклика.'}
                </p>
                <Link className="text-link small-text" href={client ? '/help' : '/student/profile'}>
                  {client ? 'Памятка заказчику' : 'Заполнить профиль'} →
                </Link>
              </section>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
