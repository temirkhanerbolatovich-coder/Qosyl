'use client';
import { useMarketplaceCopy } from './marketplace-copy';
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
  const { locale, copy } = useMarketplaceCopy();
  const { data, error, loading, refresh } = useData('applications', { projectId: id });
  const action = useAction(refresh);
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
  return (
    <div className="page-shell narrow" lang={locale}>
      <Link className="breadcrumb" href="/client/projects">
        <ArrowLeft size={14} /> {copy('Мои заказы')}
      </Link>
      <PageHeading eyebrow={copy('Выбор исполнителя')} title={copy('Отклики на ваш заказ')}>
        <span lang="und">{data.project.title}</span>
      </PageHeading>
      <div className="alert">
        <CheckCircle2 size={18} />
        <span>
          {copy(
            'Выберите по подходу к задаче и релевантным навыкам. Отсутствие выполненных заказов не мешает начать. После выбора остальные отклики закроются автоматически.',
          )}
        </span>
      </div>
      <ActionFeedback error={action.error} success={action.success} />
      {data.applications.length ? (
        <div className="stack">
          {data.applications.map((a) => (
            <article className="panel" key={a.id}>
              <header className="applicant-header">
                <div className="applicant-profile">
                  <span className="avatar">{a.student?.name.slice(0, 1) ?? copy('С')}</span>
                  <div>
                    <strong>{a.student?.name ?? copy('Исполнитель')}</strong>
                    <p>
                      {a.student?.studentProfile?.discipline ||
                        copy('Студент / начинающий специалист')}
                      {a.student?.studentProfile?.city ? ` · ${a.student.studentProfile.city}` : ''}
                    </p>
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </header>
              <div className="tag-row" style={{ marginBottom: 16 }}>
                {a.student?.studentProfile?.skills.map((s) => (
                  <span className="tag" key={s} lang="und">
                    {s}
                  </span>
                ))}
              </div>
              <p className="applicant-message" lang="und">
                {a.message}
              </p>
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
                      {copy('Работа')} {index + 1} · {link}
                      <ExternalLink size={12} style={{ display: 'inline', marginLeft: 5 }} />
                    </a>
                  ))}
                </div>
              )}
              <div className="row-meta" style={{ marginBottom: 18 }}>
                <span>
                  {copy('Отклик от')} {date(a.createdAt, true, locale)}
                </span>
                <span>
                  {a.student?.studentProfile?.weeklyHours ?? '—'} {copy('ч. в неделю')}
                </span>
              </div>
              {data.project.status === 'published' &&
                a.status === 'active' &&
                (confirmId === a.id ? (
                  <div className="alert warning" style={{ display: 'block' }}>
                    <p>
                      {locale === 'kk' ? 'Орындаушыны тағайындау:' : 'Назначить'}{' '}
                      <span lang="und">{a.student?.name ?? copy('Исполнитель')}</span>?{' '}
                      {locale === 'kk'
                        ? 'Шарттарды екі тарап та растауы керек.'
                        : 'Условия ещё нужно будет подтвердить обеим сторонам.'}
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
                        {copy('Подтвердить выбор')}
                      </button>
                      <button className="button secondary" onClick={() => setConfirmId(null)}>
                        {copy('Отмена')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="button" onClick={() => setConfirmId(a.id)}>
                    {copy('Выбрать исполнителя')}
                  </button>
                ))}
              {a.status === 'selected' && (
                <Link className="button" href={`/work/${id}`}>
                  {copy('Перейти к согласованию')}
                </Link>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title={copy('Откликов пока нет')}>
          {copy('Когда студент откликнется, здесь появятся его сообщение и выбранные работы.')}
        </EmptyState>
      )}
    </div>
  );
}
