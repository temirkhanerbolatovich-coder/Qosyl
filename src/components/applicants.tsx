'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react';
import { date } from '@/lib/labels';
import {
  ActionFeedback,
  EmptyState,
  LoadState,
  PageHeading,
  StatusBadge,
  useAction,
  useData,
} from './platform';

export function ApplicantsScreen({ id }: { id: string }) {
  const { data, error, loading, refresh } = useData('applications', { projectId: id });
  const action = useAction(refresh);
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
  return (
    <div className="page-shell narrow">
      <Link className="breadcrumb" href="/client/projects">
        <ArrowLeft size={14} />
        Мои заказы
      </Link>
      <PageHeading eyebrow="Выбор исполнителя" title="Отклики на ваш заказ">
        {data.project.title}
      </PageHeading>
      <div className="alert">
        <CheckCircle2 size={18} />
        <span>
          Выберите по подходу к задаче и релевантным навыкам. Отсутствие выполненных заказов не
          мешает начать. После выбора остальные отклики закроются автоматически.
        </span>
      </div>
      <ActionFeedback error={action.error} success={action.success} />
      {data.applications.length ? (
        <div className="stack">
          {data.applications.map((a) => (
            <article className="panel" key={a.id}>
              <header className="applicant-header">
                <div className="applicant-profile">
                  <span className="avatar">{a.student?.name.slice(0, 1) ?? 'С'}</span>
                  <div>
                    <strong>{a.student?.name ?? 'Исполнитель'}</strong>
                    <p>
                      {a.student?.studentProfile?.discipline || 'Студент / начинающий специалист'}
                      {a.student?.studentProfile?.city ? ` · ${a.student.studentProfile.city}` : ''}
                    </p>
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </header>
              <div className="tag-row" style={{ marginBottom: 16 }}>
                {a.student?.studentProfile?.skills.map((s) => (
                  <span className="tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>
              <p className="applicant-message">{a.message}</p>
              {a.links.length > 0 && (
                <div className="link-list">
                  {a.links.map((link, index) => (
                    <a
                      className="external-link"
                      href={link}
                      key={link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Работа {index + 1} · {link}
                      <ExternalLink size={12} style={{ display: 'inline', marginLeft: 5 }} />
                    </a>
                  ))}
                </div>
              )}
              <div className="row-meta" style={{ marginBottom: 18 }}>
                <span>Отклик от {date(a.createdAt, true)}</span>
                <span>{a.student?.studentProfile?.weeklyHours ?? '—'} ч. в неделю</span>
              </div>
              {data.project.status === 'published' &&
                a.status === 'active' &&
                (confirmId === a.id ? (
                  <div className="alert warning" style={{ display: 'block' }}>
                    <p>
                      Назначить {a.student?.name ?? 'этого исполнителя'}? Условия ещё нужно будет
                      подтвердить обеим сторонам.
                    </p>
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={action.busy}
                        onClick={async () => {
                          await action.run(
                            'selectApplicant',
                            { projectId: id, applicationId: a.id },
                            'Исполнитель выбран. Теперь согласуйте условия.',
                          );
                          setConfirmId(null);
                        }}
                      >
                        Подтвердить выбор
                      </button>
                      <button className="button secondary" onClick={() => setConfirmId(null)}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="button" onClick={() => setConfirmId(a.id)}>
                    Выбрать исполнителя
                  </button>
                ))}
              {a.status === 'selected' && (
                <Link className="button" href={`/work/${id}`}>
                  Перейти к согласованию
                </Link>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Откликов пока нет">
          Когда студент откликнется, здесь появятся его сообщение и выбранные работы.
        </EmptyState>
      )}
    </div>
  );
}
