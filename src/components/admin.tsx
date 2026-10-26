'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { categoryLabels, date, money } from '@/lib/labels';
import {
  ActionFeedback,
  DemoBadge,
  EmptyState,
  LoadState,
  PageHeading,
  useAction,
  useData,
  WorkspaceNav,
} from './platform';
import { PilotMetricsPanel } from './pilot-metrics';
import { PilotCostJournal } from './pilot-cost-journal';
import { BackgroundJobsPanel } from './background-jobs';
import { ContentIntakePanel } from './content-intake';
import { LeadsPanel } from './leads';

const tabs = [
  { id: 'leads', title: 'Лиды и обсуждения' },
  { id: 'content', title: 'Сбор возможностей' },
  { id: 'background', title: 'Фоновые задачи' },
  { id: 'metrics', title: 'Результаты пилота' },
  { id: 'projects', title: 'Заказы' },
  { id: 'clients', title: 'Заказчики' },
  { id: 'reports', title: 'Жалобы' },
  { id: 'users', title: 'Пользователи' },
  { id: 'audit', title: 'Журнал действий' },
];
export function AdminScreen({ initialTab = 'projects' }: { initialTab?: string }) {
  const [tab, setTab] = useState(initialTab);
  const { data, error, loading, refresh } = useData('admin');
  const action = useAction(refresh);
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
  const queue = data.projects.filter((p) => p.status === 'pending_moderation');
  const published = data.projects.filter((p) => p.status === 'published');
  return (
    <div className="page-shell">
      <PageHeading
        eyebrow="Администрирование"
        title="Модерация и доверие"
        action={
          <span className="badge">
            <ShieldCheck size={13} />
            Доступ администратора
          </span>
        }
      >
        Проверяйте конкретный результат, честные условия и безопасность задач. Решения с причинами
        сохраняются в аудите.
      </PageHeading>
      <WorkspaceNav active="/admin" />
      <div className="admin-grid">
        <div className="summary-card">
          <strong>{data.stats.completed ?? 0}</strong>
          <p>Реальных заказов закрыто</p>
        </div>
        <div className="summary-card">
          <strong>{data.stats.paid ?? 0}</strong>
          <p>Оплату подтвердили обе стороны</p>
        </div>
        <div className="summary-card">
          <strong>{data.stats.firstPaidStudents ?? 0}</strong>
          <p>Студентов с первым оплаченным опытом</p>
        </div>
        <div className="summary-card">
          <strong>{queue.length}</strong>
          <p>Заказов ожидают модерации</p>
        </div>
      </div>
      <p className="muted small-text">
        Продуктовые показатели не учитывают демонстрационные заказы. Статусы оплаты — заявления
        участников, а не банковские транзакции.
      </p>
      <nav className="admin-tabs" aria-label="Разделы администрирования">
        {tabs.map((t) => (
          <button
            className={tab === t.id ? 'active' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
            key={t.id}
          >
            {t.title}
            {t.id === 'reports'
              ? ` (${data.reports.filter((r) => r.status === 'open').length})`
              : t.id === 'projects'
                ? ` (${queue.length})`
                : ''}
          </button>
        ))}
      </nav>
      {tab === 'content' && <ContentIntakePanel />}
      {tab === 'leads' && <LeadsPanel />}
      {tab === 'background' && <BackgroundJobsPanel />}
      {tab === 'metrics' && (
        <div className="stack">
          <PilotMetricsPanel />
          <PilotCostJournal />
        </div>
      )}
      <ActionFeedback error={action.error} success={action.success} />
      {tab === 'projects' && (
        <>
          <section className="panel">
            <h2>Очередь проверки</h2>
            {queue.length ? (
              queue.map((p) => (
                <article className="admin-entry" key={p.id}>
                  <div>
                    <div className="tag-row" style={{ marginBottom: 10 }}>
                      <span className="tag">{categoryLabels[p.category] ?? p.category}</span>
                      {p.demo && <DemoBadge />}
                    </div>
                    <h3>
                      <Link href={`/projects/${p.id}`}>
                        {p.title}
                        <ArrowUpRight size={13} style={{ display: 'inline', marginLeft: 5 }} />
                      </Link>
                    </h3>
                    <p>
                      {money(p.budgetKzt)} · {p.estimatedHours} ч. · до {date(p.dueAt)}
                    </p>
                    <p className="pre-wrap">{p.description}</p>
                    <p>
                      <strong>Результат:</strong> {p.deliverables}
                    </p>
                    <ol className="criteria-list">
                      {p.acceptanceCriteria.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ol>
                  </div>
                  <form
                    className="admin-entry-controls"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const submitter = (e.nativeEvent as SubmitEvent)
                        .submitter as HTMLButtonElement | null;
                      await action.run(
                        'moderateProject',
                        {
                          projectId: p.id,
                          approve: submitter?.value === 'approve',
                          reason: f.get('reason'),
                        },
                        submitter?.value === 'approve'
                          ? 'Заказ опубликован'
                          : 'Заказ возвращён автору с объяснением',
                      );
                    }}
                  >
                    <label className="field">
                      Комментарий / причина
                      <textarea
                        name="reason"
                        maxLength={2000}
                        placeholder="При возврате — не меньше 10 символов"
                      />
                    </label>
                    <div className="button-row">
                      <button
                        className="button small"
                        name="decision"
                        value="approve"
                        disabled={action.busy}
                      >
                        <CheckCircle2 size={14} />
                        Одобрить
                      </button>
                      <button
                        className="button secondary small"
                        name="decision"
                        value="reject"
                        disabled={action.busy}
                      >
                        На доработку
                      </button>
                    </div>
                  </form>
                </article>
              ))
            ) : (
              <p className="muted small-text">Все поступившие задачи проверены.</p>
            )}
          </section>
          {published.length > 0 && (
            <section className="panel">
              <h2>Опубликованные заказы</h2>
              {published.map((p) => (
                <article className="admin-entry" key={p.id}>
                  <div>
                    <h3>
                      <Link href={`/projects/${p.id}`}>{p.title}</Link>
                    </h3>
                    <p>
                      {money(p.budgetKzt)} · {p.demo ? 'ДЕМО' : 'Настоящий заказ'}
                    </p>
                  </div>
                  <form
                    className="admin-entry-controls"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      await action.run(
                        'pauseProject',
                        { projectId: p.id, reason: f.get('reason') },
                        'Публикация приостановлена, автор уведомлён',
                      );
                    }}
                  >
                    <label className="field">
                      Причина приостановки
                      <input name="reason" required minLength={10} maxLength={2000} />
                    </label>
                    <button className="button secondary small" disabled={action.busy}>
                      Приостановить
                    </button>
                  </form>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {tab === 'clients' && (
        <section className="panel">
          <h2>Проверка заказчиков</h2>
          {data.clients.length ? (
            data.clients.map((c) => (
              <article className="admin-entry" key={c.userId}>
                <div>
                  <h3>{c.name}</h3>
                  <p>
                    {c.industry} · {c.city}
                  </p>
                  <p className="pre-wrap">{c.description}</p>
                  <span
                    className={`badge ${c.verificationStatus === 'verified' ? 'status-completed' : ''}`}
                  >
                    {c.verificationStatus === 'verified'
                      ? 'Проверен'
                      : c.verificationStatus === 'rejected'
                        ? 'Проверка отклонена'
                        : 'Ожидает проверки'}
                  </span>
                  {c.verificationReason && <p style={{ marginTop: 10 }}>{c.verificationReason}</p>}
                </div>
                <form
                  className="admin-entry-controls"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const submitter = (e.nativeEvent as SubmitEvent)
                      .submitter as HTMLButtonElement | null;
                    await action.run(
                      'moderateClient',
                      {
                        userId: c.userId,
                        approve: submitter?.value === 'approve',
                        reason: f.get('reason'),
                      },
                      'Решение о проверке сохранено',
                    );
                  }}
                >
                  <label className="field">
                    Основание / причина
                    <textarea
                      name="reason"
                      maxLength={2000}
                      placeholder="Укажите выполненную проверку; при отказе — причину"
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="button small"
                      name="decision"
                      value="approve"
                      disabled={action.busy}
                    >
                      Подтвердить
                    </button>
                    <button
                      className="button secondary small"
                      name="decision"
                      value="reject"
                      disabled={action.busy}
                    >
                      Отклонить
                    </button>
                  </div>
                </form>
              </article>
            ))
          ) : (
            <p className="muted small-text">Заказчиков на проверке пока нет.</p>
          )}
        </section>
      )}
      {tab === 'reports' &&
        (data.reports.length ? (
          <section className="panel">
            <h2>Обращения участников</h2>
            {data.reports.map((r) => (
              <article className="admin-entry" key={r.id}>
                <div>
                  <div className="tag-row" style={{ marginBottom: 10 }}>
                    <span className="badge">{r.status === 'open' ? 'Открыто' : 'Рассмотрено'}</span>
                  </div>
                  <h3>Обращение от {date(r.createdAt, true)}</h3>
                  <p className="pre-wrap">{r.reason}</p>
                  {r.projectId && (
                    <Link className="text-link small-text" href={`/projects/${r.projectId}`}>
                      Открыть заказ →
                    </Link>
                  )}
                  {r.resolution && (
                    <p className="pre-wrap" style={{ marginTop: 15 }}>
                      <strong>Решение:</strong> {r.resolution}
                    </p>
                  )}
                </div>
                {r.status === 'open' && (
                  <form
                    className="admin-entry-controls"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      await action.run(
                        'resolveReport',
                        { reportId: r.id, resolution: f.get('resolution') },
                        'Обращение рассмотрено, участник уведомлён',
                      );
                    }}
                  >
                    <label className="field">
                      Решение модератора
                      <textarea name="resolution" minLength={10} maxLength={2000} required />
                    </label>
                    <button className="button small" disabled={action.busy}>
                      Сохранить решение
                    </button>
                  </form>
                )}
              </article>
            ))}
          </section>
        ) : (
          <EmptyState title="Открытых обращений нет">
            Жалобы и спорные ситуации появятся в этом разделе.
          </EmptyState>
        ))}
      {tab === 'users' && (
        <section className="panel">
          <h2>Управление доступом</h2>
          <div className="alert warning">
            <AlertTriangle size={17} />
            <span>
              Блокировка сохраняет историю заказов и отзывает доступ. Административные привилегии
              меняются только серверной командой.
            </span>
          </div>
          {data.users.map((u) => (
            <article className="admin-entry" key={u.id}>
              <div>
                <h3>{u.name}</h3>
                <p>
                  {u.roles
                    .map((role) =>
                      role === 'student'
                        ? 'Исполнитель'
                        : role === 'client'
                          ? 'Заказчик'
                          : 'Администратор',
                    )
                    .join(', ') || 'Роль не выбрана'}
                </p>
                <span
                  className={`badge ${u.status === 'suspended' ? 'status-cancelled' : 'status-completed'}`}
                >
                  {u.status === 'suspended' ? 'Доступ приостановлен' : 'Активен'}
                </span>
                {u.demo && (
                  <span style={{ marginLeft: 8 }}>
                    <DemoBadge />
                  </span>
                )}
                {u.statusReason && <p style={{ marginTop: 10 }}>{u.statusReason}</p>}
              </div>
              {!u.roles.includes('admin') && (
                <form
                  className="admin-entry-controls"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    await action.run(
                      'suspendUser',
                      { userId: u.id, suspend: u.status !== 'suspended', reason: f.get('reason') },
                      'Статус доступа обновлён',
                    );
                  }}
                >
                  <label className="field">
                    Объяснение участнику
                    <input name="reason" required minLength={10} maxLength={2000} />
                  </label>
                  <button
                    className={`button small ${u.status === 'suspended' ? 'secondary' : 'danger'}`}
                    disabled={action.busy}
                  >
                    {u.status === 'suspended' ? 'Восстановить доступ' : 'Приостановить аккаунт'}
                  </button>
                </form>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === 'audit' && (
        <section className="panel">
          <h2>Аудиторский след</h2>
          <p className="muted small-text">
            Журнал только для чтения. Он не содержит паролей и токенов.
          </p>
          {data.audit.length ? (
            <ol className="timeline">
              {data.audit.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.action}</strong>
                  <p className="small-text pre-wrap" style={{ margin: '5px 0' }}>
                    {entry.reason}
                  </p>
                  <small>
                    {entry.actor?.name} · {date(entry.createdAt, true)} · объект {entry.targetId}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small-text">Административных действий пока нет.</p>
          )}
        </section>
      )}
    </div>
  );
}
