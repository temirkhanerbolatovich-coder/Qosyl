'use client';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileCheck2,
  Info,
  LockKeyhole,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { date, eventLabels, lines, modeLabels, money, paymentLabels } from '@/lib/labels';
import { ProjectForm } from './project-form';
import { ComplaintForm } from './project-detail';
import {
  ActionFeedback,
  DemoBadge,
  LoadState,
  StatusBadge,
  useAction,
  useData,
  useViewer,
} from './platform';

function snapshotText(snapshot: Record<string, unknown>, key: string, fallback: string) {
  const value = snapshot[key];
  return typeof value === 'string' ? value : fallback;
}
function snapshotNumber(snapshot: Record<string, unknown>, key: string, fallback: number) {
  const value = snapshot[key];
  return typeof value === 'number' ? value : fallback;
}
function snapshotCriteria(snapshot: Record<string, unknown>, fallback: string[]) {
  const value = snapshot.acceptanceCriteria;
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? (value as string[])
    : fallback;
}

export function WorkspaceScreen({ id }: { id: string }) {
  const viewer = useViewer();
  const { data, error, loading, refresh } = useData('work', { id });
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
  const p = data.project;
  const client = viewer?.id === p.clientId;
  const student = viewer?.id === p.assignedStudentId;
  const agreement = data.agreements[0];
  const snapshot = agreement?.snapshotJson ?? {};
  const criteria = snapshotCriteria(snapshot, p.acceptanceCriteria);
  const accepted = ['accepted', 'completed'].includes(p.status);
  const working = ['in_progress', 'changes_requested'].includes(p.status);
  const latest = data.submissions[0];
  const payment = data.payment;
  const portfolio = data.portfolio;
  const stages = ['Согласование', 'Выполнение', 'Приёмка', 'Закрытие'];
  const step =
    p.status === 'assigned' ? 0 : working ? 1 : p.status === 'submitted' ? 2 : accepted ? 3 : -1;
  const myApproval = client ? agreement?.clientApprovedAt : agreement?.studentApprovedAt;
  const mayPropose = ['assigned', 'in_progress', 'changes_requested'].includes(p.status);
  const mayDispute = [
    'assigned',
    'in_progress',
    'submitted',
    'changes_requested',
    'accepted',
    'completed',
  ].includes(p.status);
  const mayCancel = p.status === 'assigned';
  return (
    <div className="page-shell">
      <Link className="breadcrumb" href="/dashboard">
        <ArrowLeft size={14} />В личный кабинет
      </Link>
      <div className="workspace-heading">
        <div className="detail-top-tags">
          <StatusBadge status={p.status} />
          {p.demo && <DemoBadge />}
          <span className="muted small-text">Рабочая область · только участникам</span>
        </div>
        <h1 className="detail-title">{p.title}</h1>
        <p className="muted small-text">
          Заказчик: {p.client?.clientProfile?.name ?? p.client?.name ?? '—'}{' '}
          <span style={{ margin: '0 8px' }}>·</span> Исполнитель: {p.assignedStudent?.name ?? '—'}
        </p>
      </div>
      <div className="workflow-steps" aria-label="Этапы заказа">
        {stages.map((label, i) => (
          <div
            className={`workflow-step ${step === i ? 'active' : step > i ? 'done' : ''}`}
            key={label}
          >
            <strong>
              0{i + 1} · {label}
            </strong>
          </div>
        ))}
      </div>
      <ActionFeedback error={action.error} success={action.success} />
      {p.status === 'disputed' && (
        <div className="alert error">
          <Info size={18} />
          <span>
            Открыт спор. Передача результата и закрытие приостановлены. Модератор рассмотрит
            обращение; гарантии выплаты или автоматического арбитража нет.
          </span>
        </div>
      )}
      <div className="split">
        <div className="split-main stack">
          <section className="panel">
            <div className="section-title">
              <h2>Согласованные условия</h2>
              <span className="badge">Версия {agreement?.number ?? '—'}</span>
            </div>
            <p className="prose pre-wrap">
              {snapshotText(snapshot, 'deliverables', p.deliverables)}
            </p>
            <dl className="definition-list">
              <div>
                <dt>Бюджет</dt>
                <dd>{money(snapshotNumber(snapshot, 'budgetKzt', p.budgetKzt))}</dd>
              </div>
              <div>
                <dt>Трудоёмкость</dt>
                <dd>{snapshotNumber(snapshot, 'estimatedHours', p.estimatedHours)} ч.</dd>
              </div>
              <div>
                <dt>Дедлайн</dt>
                <dd>{date(snapshotText(snapshot, 'dueAt', p.dueAt))}</dd>
              </div>
              <div>
                <dt>Формат</dt>
                <dd>
                  {modeLabels[snapshotText(snapshot, 'mode', p.mode)]} ·{' '}
                  {snapshotText(snapshot, 'city', p.city) || 'Любой город'}
                </dd>
              </div>
            </dl>
            <div className="divider" />
            <h3>Критерии приёмки</h3>
            <ol className="criteria-list">
              {criteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
            <div className="agreement-status">
              <span className={agreement?.clientApprovedAt ? 'approved' : ''}>
                {agreement?.clientApprovedAt ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                Заказчик {agreement?.clientApprovedAt ? 'подтвердил' : 'не подтвердил'}
              </span>
              <span className={agreement?.studentApprovedAt ? 'approved' : ''}>
                {agreement?.studentApprovedAt ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                Исполнитель {agreement?.studentApprovedAt ? 'подтвердил' : 'не подтвердил'}
              </span>
            </div>
            {p.status === 'assigned' && (
              <>
                <div className="alert">
                  <LockKeyhole size={17} />
                  <span>
                    Начало работы возможно только после двух подтверждений этой версии. Проверьте
                    бюджет, сроки, объём и критерии.
                  </span>
                </div>
                {!myApproval && (client || student) && (
                  <button
                    className="button"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(
                        'approveAgreement',
                        { projectId: id, agreementId: agreement?.id },
                        'Ваша сторона подтвердила условия',
                      )
                    }
                  >
                    Подтвердить условия версии {agreement?.number}
                  </button>
                )}
              </>
            )}
            {p.locationPrivate || p.contactPrivate ? (
              <div className="alert">
                <LockKeyhole size={17} />
                <div>
                  {p.locationPrivate && (
                    <p style={{ marginBottom: p.contactPrivate ? 6 : 0 }}>
                      <strong>Место встречи:</strong> {p.locationPrivate}
                    </p>
                  )}
                  {p.contactPrivate && (
                    <p style={{ margin: 0 }}>
                      <strong>Контакт:</strong> {p.contactPrivate}
                    </p>
                  )}
                  <small>Закрытая информация, доступная участникам проекта.</small>
                </div>
              </div>
            ) : null}
            {mayPropose && (client || student) && (
              <details className="details-toggle">
                <summary>Изменить условия по взаимному согласию</summary>
                <p className="muted small-text">
                  Предложение создаст новую версию и вернёт заказ на согласование. Выполнение
                  возобновится после подтверждения обеими сторонами. Прошлая версия останется в
                  истории.
                </p>
                <ProjectForm initial={p} proposal afterSave={refresh} />
              </details>
            )}
            {data.agreements.length > 1 && (
              <details className="details-toggle">
                <summary>История версий условий ({data.agreements.length})</summary>
                {data.agreements.map((version) => {
                  const s = version.snapshotJson;
                  return (
                    <article className="submission" key={version.id}>
                      <div className="submission-heading">
                        <span>Версия {version.number}</span>
                        <span className="muted small-text">{date(version.createdAt, true)}</span>
                      </div>
                      <p>{snapshotText(s, 'deliverables', '')}</p>
                      <p className="muted small-text">
                        {money(snapshotNumber(s, 'budgetKzt', p.budgetKzt))} · до{' '}
                        {date(snapshotText(s, 'dueAt', p.dueAt))}
                      </p>
                      <ol className="criteria-list">
                        {snapshotCriteria(s, []).map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ol>
                      <p className="small-text muted" style={{ margin: 0 }}>
                        Заказчик:{' '}
                        {version.clientApprovedAt
                          ? date(version.clientApprovedAt, true)
                          : 'не подтвердил'}
                        <br />
                        Исполнитель:{' '}
                        {version.studentApprovedAt
                          ? date(version.studentApprovedAt, true)
                          : 'не подтвердил'}
                      </p>
                    </article>
                  );
                })}
              </details>
            )}
          </section>
          {data.milestones.length > 0 && (
            <section className="panel">
              <h2>Чек-лист результата</h2>
              <p className="muted small-text">
                Помогает проверить готовность. Отметки не заменяют приёмку заказчика.
              </p>
              <div className="checklist">
                {data.milestones.map((m) => (
                  <button
                    type="button"
                    className={m.done ? 'checked' : ''}
                    aria-pressed={Boolean(m.done)}
                    disabled={action.busy || !working || (!client && !student)}
                    onClick={() =>
                      action.run('toggleMilestone', { projectId: id, milestoneId: m.id }, '')
                    }
                    key={m.id}
                  >
                    <span className="check-box">{m.done && <Check size={13} />}</span>
                    <span>{m.title}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {student && working && (
            <section className="panel">
              <div className="section-title">
                <h2>Передать результат</h2>
                <Send size={19} className="muted" />
              </div>
              <p className="muted small-text">
                Добавьте ссылку на результат и поясните, как выполнены критерии. Не загружайте
                персональные данные и закрытые материалы клиентов.
              </p>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await action.run(
                    'submitDeliverable',
                    { projectId: id, links: lines(f.get('links')), notes: f.get('notes') },
                    'Результат передан заказчику на проверку',
                  );
                }}
              >
                <label className="field">
                  Ссылки на результат
                  <textarea
                    name="links"
                    required
                    maxLength={3000}
                    placeholder="https://… — одна HTTPS-ссылка на строку"
                  />
                  <small>До 5 ссылок. Убедитесь, что заказчик имеет доступ к материалам.</small>
                </label>
                <label className="field">
                  Комментарий к сдаче
                  <textarea
                    name="notes"
                    required
                    minLength={10}
                    maxLength={4000}
                    placeholder="Что выполнено и где проверить каждый критерий?"
                  />
                </label>
                <button className="button" disabled={action.busy} type="submit">
                  Сдать результат
                </button>
              </form>
            </section>
          )}
          {data.submissions.length > 0 && (
            <section className="panel">
              <h2>Результаты и приёмка</h2>
              {data.submissions.map((submission, index) => (
                <article className="submission" key={submission.id}>
                  <div className="submission-heading">
                    <span>
                      Сдача {data.submissions.length - index}
                      {index === 0 ? ' · последняя' : ''}
                    </span>
                    <time className="muted small-text">{date(submission.createdAt, true)}</time>
                  </div>
                  <p className="pre-wrap">{submission.notes}</p>
                  <div className="link-list">
                    {submission.links.map((link, i) => (
                      <a
                        className="external-link"
                        href={link}
                        key={link}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Результат {i + 1} · {link}
                        <ExternalLink size={11} style={{ display: 'inline', marginLeft: 5 }} />
                      </a>
                    ))}
                  </div>
                  {submission.revisions?.map((revision) => (
                    <div className="revision" key={revision.id}>
                      <strong>Запрошены правки · {date(revision.createdAt, true)}</strong>
                      <p className="pre-wrap">{revision.notes}</p>
                      <p style={{ marginTop: 8 }}>
                        Критерии:{' '}
                        {revision.criteriaIndexes
                          .map((i) => `${i + 1}. ${criteria[i] ?? 'Критерий из предыдущей версии'}`)
                          .join('; ')}
                      </p>
                    </div>
                  ))}
                  {client && p.status === 'submitted' && latest?.id === submission.id && (
                    <>
                      <button
                        className="button"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            'acceptSubmission',
                            { projectId: id, submissionId: submission.id },
                            'Результат принят. Подтвердите оплату и закрытие отдельно.',
                          )
                        }
                      >
                        <FileCheck2 size={16} />
                        Принять результат
                      </button>
                      <details className="details-toggle">
                        <summary>Запросить конкретные правки</summary>
                        <form
                          className="stack"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            await action.run(
                              'requestChanges',
                              {
                                projectId: id,
                                submissionId: submission.id,
                                notes: f.get('notes'),
                                criteriaIndexes: f.getAll('criteria').map(Number),
                              },
                              'Список правок передан исполнителю',
                            );
                          }}
                        >
                          <div className="field">
                            <span>Какие согласованные критерии не выполнены?</span>
                            {criteria.map((criterion, i) => (
                              <label className="check-label" key={i}>
                                <input type="checkbox" name="criteria" value={i} />
                                <span>{criterion}</span>
                              </label>
                            ))}
                          </div>
                          <label className="field">
                            Что именно исправить?
                            <textarea
                              name="notes"
                              required
                              minLength={10}
                              maxLength={3000}
                              placeholder="Укажите конкретные замечания в рамках согласованного объёма"
                            />
                          </label>
                          <button className="button secondary" disabled={action.busy} type="submit">
                            Отправить замечания
                          </button>
                        </form>
                      </details>
                    </>
                  )}
                  {index === 0 && accepted && (
                    <span className="badge status-accepted">
                      <CheckCircle2 size={12} />
                      Результат принят заказчиком
                    </span>
                  )}
                </article>
              ))}
            </section>
          )}
          {accepted && (
            <section className="panel">
              <h2>Подтверждённый опыт</h2>
              <p className="muted small-text">
                Приёмка подтверждена заказчиком. Публикация записи — только по согласию обеих
                сторон. Внутренние материалы заказа автоматически в портфолио не попадают.
              </p>
              {student && (
                <details className="details-toggle" open={!portfolio?.summary}>
                  <summary>
                    {portfolio?.summary
                      ? 'Изменить запись и видимость'
                      : 'Подготовить запись портфолио'}
                  </summary>
                  <form
                    className="stack"
                    key={`${portfolio?.id}-${portfolio?.summary}`}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      await action.run(
                        'setPortfolio',
                        {
                          projectId: id,
                          title: f.get('title'),
                          summary: f.get('summary'),
                          role: f.get('role'),
                          skills: String(f.get('skills') ?? '')
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                          publicLinks: lines(f.get('publicLinks')),
                          visibility: f.get('visibility'),
                        },
                        'Запись сохранена. Новую публичную версию нужно согласовать обеим сторонам.',
                      );
                    }}
                  >
                    <label className="field">
                      Публичное название
                      <input
                        name="title"
                        required
                        minLength={5}
                        maxLength={140}
                        defaultValue={portfolio?.title ?? p.title}
                      />
                    </label>
                    <label className="field">
                      Краткое описание результата
                      <textarea
                        name="summary"
                        required
                        minLength={20}
                        maxLength={2000}
                        defaultValue={portfolio?.summary ?? ''}
                        placeholder="Обезличенное описание вклада и результата, без закрытых сведений"
                      />
                    </label>
                    <label className="field">
                      Ваш вклад / роль
                      <input
                        name="role"
                        required
                        minLength={3}
                        maxLength={150}
                        defaultValue={portfolio?.role ?? ''}
                        placeholder="Например, анализ данных и создание отчёта"
                      />
                    </label>
                    <label className="field">
                      Навыки через запятую
                      <input
                        name="skills"
                        defaultValue={portfolio?.skills.join(', ') ?? p.skills.join(', ')}
                        maxLength={500}
                      />
                    </label>
                    <label className="field">
                      Только разрешённые публичные ссылки
                      <textarea
                        name="publicLinks"
                        maxLength={2000}
                        defaultValue={portfolio?.publicLinks.join('\n') ?? ''}
                        placeholder="Не копируйте сюда приватные ссылки на сдачу"
                      />
                      <small>В обезличенном публичном режиме ссылки не публикуются.</small>
                    </label>
                    <label className="field">
                      Видимость
                      <select name="visibility" defaultValue={portfolio?.visibility ?? 'private'}>
                        <option value="private">Только участникам заказа</option>
                        <option value="public">Публично после двух согласий</option>
                        <option value="redacted_public">Публично, обезличено и без ссылок</option>
                      </select>
                    </label>
                    <button className="button secondary" disabled={action.busy} type="submit">
                      Сохранить запись портфолио
                    </button>
                  </form>
                </details>
              )}
              {portfolio && (
                <div className="submission">
                  <div className="section-title">
                    <h3 style={{ margin: 0 }}>{portfolio.title}</h3>
                    <span className="badge status-accepted">client-confirmed</span>
                  </div>
                  <p className="pre-wrap small-text">
                    {portfolio.summary || 'Описание ещё не заполнено'}
                  </p>
                  {portfolio.role && (
                    <p className="small-text">
                      <strong>Вклад:</strong> {portfolio.role}
                    </p>
                  )}
                  <div className="tag-row">
                    {portfolio.skills.map((skill) => (
                      <span className="tag" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                  {portfolio.publicLinks.length > 0 && (
                    <div className="link-list">
                      {portfolio.publicLinks.map((link) => (
                        <a
                          className="external-link"
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          key={link}
                        >
                          {link}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="consent-status">
                    Видимость:{' '}
                    {portfolio.visibility === 'private'
                      ? 'Приватная'
                      : portfolio.visibility === 'redacted_public'
                        ? 'Публичная обезличенная'
                        : 'Публичная'}
                    <br />
                    Заказчик: {portfolio.clientConsentAt ? 'согласовано' : 'согласие не получено'}
                    <br />
                    Исполнитель:{' '}
                    {portfolio.studentConsentAt ? 'согласовано' : 'согласие не получено'}
                  </div>
                  {portfolio.visibility !== 'private' &&
                    !(client ? portfolio.clientConsentAt : portfolio.studentConsentAt) && (
                      <button
                        className="button secondary small"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            'consentPortfolio',
                            { projectId: id, expectedUpdatedAt: portfolio.updatedAt },
                            'Вы согласовали публикацию этой версии записи',
                          )
                        }
                      >
                        Согласовать видимость этой версии
                      </button>
                    )}
                  {portfolio.clientConsentAt &&
                    portfolio.studentConsentAt &&
                    portfolio.visibility !== 'private' && (
                      <p className="alert success">
                        <ShieldCheck size={16} />
                        <span>
                          Обе стороны согласовали запись. Она видна в{' '}
                          <Link className="text-link" href={`/talent/${p.assignedStudentId}`}>
                            публичном профиле исполнителя
                          </Link>
                          , если профиль открыт.
                        </span>
                      </p>
                    )}
                </div>
              )}
            </section>
          )}
          {accepted && (
            <section className="panel">
              <h2>Отзыв об участнике</h2>
              <p className="muted small-text">
                Один отзыв от каждой стороны, только после принятого результата. Он может появиться
                в согласованном публичном портфолио: не указывайте конфиденциальные сведения.
              </p>
              {data.reviews.some((r) => r.authorId === viewer?.id) ? (
                <p className="small-text muted">Ваш отзыв уже сохранён.</p>
              ) : (
                (client || student) && (
                  <form
                    className="stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      await action.run(
                        'createReview',
                        { projectId: id, rating: Number(f.get('rating')), body: f.get('body') },
                        'Отзыв сохранён',
                      );
                    }}
                  >
                    <label className="field">
                      Оценка
                      <select name="rating" defaultValue="5">
                        <option value="5">5 — отлично</option>
                        <option value="4">4 — хорошо</option>
                        <option value="3">3 — удовлетворительно</option>
                        <option value="2">2 — есть существенные проблемы</option>
                        <option value="1">1 — неудовлетворительно</option>
                      </select>
                    </label>
                    <label className="field">
                      Ваш опыт взаимодействия
                      <textarea
                        name="body"
                        required
                        minLength={10}
                        maxLength={1500}
                        placeholder="Что получилось хорошо и что можно улучшить?"
                      />
                    </label>
                    <button className="button secondary" disabled={action.busy}>
                      Оставить отзыв
                    </button>
                  </form>
                )
              )}
              {data.reviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <strong className="small-text">{review.author?.name ?? 'Участник'}</strong>
                  <p
                    className="review-stars"
                    style={{ margin: '6px 0' }}
                    aria-label={`Оценка ${review.rating} из 5`}
                  >
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(5 - review.rating)}
                  </p>
                  <p className="small-text pre-wrap" style={{ margin: 0 }}>
                    {review.body}
                  </p>
                </article>
              ))}
            </section>
          )}
        </div>
        <aside className="work-aside">
          <section className="panel">
            <h2>Оплата — отдельно</h2>
            <p className="payment-label">{paymentLabels[payment?.status ?? 'not_reported']}</p>
            <p className="muted small-text">
              Это заявления участников о расчёте вне площадки. Платформа не проводит и не
              гарантирует платежи.
            </p>
            {payment?.clientPaidAt && (
              <p className="small-text muted">
                Заказчик отметил: {date(payment.clientPaidAt, true)}
              </p>
            )}
            {payment?.studentReceivedAt && (
              <p className="small-text muted">
                Исполнитель подтвердил: {date(payment.studentReceivedAt, true)}
              </p>
            )}
            {accepted && (
              <div className="stack" style={{ gap: 10 }}>
                {client && !payment?.clientPaidAt && payment?.status !== 'disputed' && (
                  <button
                    className="button secondary full"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(
                        'acknowledgePayment',
                        { projectId: id, status: 'reported_paid_by_client' },
                        'Вы сообщили об оплате. Это ещё не подтверждение получения.',
                      )
                    }
                  >
                    Я оплатил вне платформы
                  </button>
                )}
                {student && !payment?.studentReceivedAt && payment?.status !== 'disputed' && (
                  <button
                    className="button secondary full"
                    disabled={action.busy || !payment?.clientPaidAt}
                    onClick={() =>
                      action.run(
                        'acknowledgePayment',
                        { projectId: id, status: 'confirmed_received_by_student' },
                        'Вы подтвердили получение оплаты',
                      )
                    }
                  >
                    Я получил оплату
                  </button>
                )}
                {student && !payment?.clientPaidAt && payment?.status !== 'disputed' && (
                  <p className="muted small-text">
                    Сначала заказчик отмечает отправку оплаты, затем вы подтверждаете получение.
                  </p>
                )}
                {payment?.status !== 'disputed' && (
                  <button
                    className="button danger full"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(
                        'acknowledgePayment',
                        { projectId: id, status: 'disputed' },
                        'Статус оплаты оспорен. Обращение передано модератору.',
                      )
                    }
                  >
                    Оспорить статус оплаты
                  </button>
                )}
                {payment?.status === 'disputed' && (
                  <p className="alert warning">
                    По оплате открыто обращение модератору. Его ответ появится в уведомлениях.
                    Рассмотрение обращения не подтверждает оплату и не выполняет возврат денег.
                  </p>
                )}
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Закрытие заказа</h2>
            <p className="muted small-text">
              Заказ завершён после приёмки и отдельного подтверждения обеими сторонами. Отметки
              оплаты показываются независимо.
            </p>
            <div className="closed-status">
              <span>
                {p.clientClosedAt ? '✓' : '○'} Заказчик{' '}
                {p.clientClosedAt ? 'закрыл' : 'ещё не закрыл'}
              </span>
              <span>
                {p.studentClosedAt ? '✓' : '○'} Исполнитель{' '}
                {p.studentClosedAt ? 'закрыл' : 'ещё не закрыл'}
              </span>
            </div>
            {p.status === 'accepted' && !(client ? p.clientClosedAt : p.studentClosedAt) && (
              <button
                className="button full"
                disabled={action.busy}
                onClick={() =>
                  action.run('closeProject', { projectId: id }, 'Ваша сторона подтвердила закрытие')
                }
              >
                Подтвердить закрытие
              </button>
            )}
            {p.status === 'completed' && (
              <span className="badge status-completed">
                <CheckCircle2 size={13} />
                Обе стороны закрыли заказ
              </span>
            )}
            {!accepted && (
              <p className="muted small-text" style={{ margin: 0 }}>
                Сначала заказчик должен принять результат.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>История решений</h2>
            <ol className="timeline">
              {data.events.map((event) => (
                <li key={event.id}>
                  <strong>{eventLabels[event.action] ?? event.action}</strong>
                  <small>
                    {event.actor?.name ? `${event.actor.name} · ` : ''}
                    {date(event.createdAt, true)}
                  </small>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel">
            <h2>Если что-то пошло не так</h2>
            <p className="muted small-text">
              Сохраняйте решения в истории. Модератор рассматривает обращения вручную.
            </p>
            {(mayDispute || mayCancel) && (
              <>
                {mayDispute && (
                  <details className="details-toggle">
                    <summary>Открыть спор по заказу</summary>
                    <form
                      className="stack"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        await action.run(
                          'disputeProject',
                          { projectId: id, reason: f.get('reason') },
                          'Спор открыт. Модератор получил обращение.',
                        );
                      }}
                    >
                      <label className="field">
                        Причина спора
                        <textarea name="reason" required minLength={10} maxLength={2000} />
                      </label>
                      <button className="button danger" disabled={action.busy}>
                        Открыть спор
                      </button>
                    </form>
                  </details>
                )}
                {mayCancel && (
                  <details className="details-toggle">
                    <summary>Отменить заказ</summary>
                    <form
                      className="stack"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        await action.run(
                          'cancelProject',
                          { projectId: id, reason: f.get('reason') },
                          'Заказ отменён. История сохранена.',
                        );
                      }}
                    >
                      <label className="field">
                        Причина отмены
                        <textarea name="reason" required minLength={10} maxLength={2000} />
                      </label>
                      <p className="small-text muted">
                        Отмена не удаляет историю и не решает вопрос расчёта за уже выполненную
                        работу.
                      </p>
                      <button className="button danger" disabled={action.busy}>
                        Подтвердить отмену
                      </button>
                    </form>
                  </details>
                )}
              </>
            )}
            <ComplaintForm projectId={id} compact />
          </section>
        </aside>
      </div>
    </div>
  );
}
