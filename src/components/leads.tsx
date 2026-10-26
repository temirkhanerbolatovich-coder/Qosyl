'use client';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ThreadsSearch } from './threads-search';
import type { LeadListData, LeadDetailData } from '@/contracts/leads';
import { date } from '@/lib/labels';
import { ActionFeedback, LoadState } from './platform';

const labels: Record<string, string> = {
  new: 'Новый',
  verified: 'Проверен',
  contacted: 'Ручной контакт записан',
  consented: 'Согласие записано',
  declined: 'Отказ',
  archived: 'Архив',
  converted: 'Создан черновик',
};
const localDate = (value: string) => {
  const time = new Date(value);
  return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
async function request<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить действие.');
  return result.data;
}
function LeadRecord({
  id,
  registry,
  onSaved,
  onClose,
}: {
  id: string;
  registry: LeadListData;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [data, setData] = useState<LeadDetailData | null>(null),
    [page, setPage] = useState(1),
    [action, setAction] = useState('addLeadNote');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const url = `/api/admin/leads/${encodeURIComponent(id)}?page=${page}`;
  useEffect(() => {
    let active = true;
    void request<LeadDetailData>(url)
      .then((result) => {
        if (active) {
          setData(result);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Ошибка чтения.');
      });
    return () => {
      active = false;
    };
  }, [url]);
  if (!data) return <LoadState error={error} />;
  const lead = data.lead;
  const actions = [
    ['addLeadNote', 'Добавить заметку'],
    ['assignLead', 'Сменить ответственного'],
  ];
  if (lead.status === 'new')
    actions.push(
      ['editLead', 'Исправить описание и срок'],
      ['verifyLead', 'Зафиксировать проверку'],
    );
  if (lead.status === 'verified') actions.push(['recordContact', 'Записать итог ручного контакта']);
  if (lead.status === 'contacted' && lead.kind === 'business_request')
    actions.push(['recordConsent', 'Записать согласие и передать заказчику']);
  if (lead.status === 'consented') actions.push(['revokeConsent', 'Отозвать передачу']);
  if (lead.status !== 'converted') {
    actions.push(['closeLead', 'Зафиксировать отказ или архив']);
    if (lead.status !== 'new') actions.push(['reopenLead', 'Вернуть на проверку']);
  }
  return (
    <section className="panel stack content-editor" aria-label="Карточка приватного лида">
      <div className="button-row">
        <h3>{lead.title}</h3>
        <button className="button secondary" onClick={onClose}>
          Закрыть карточку
        </button>
      </div>
      <p>
        {labels[lead.status]} · версия {lead.version} · актуален до {date(lead.expiresAt, true)}
      </p>
      <p>{lead.summary}</p>
      <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer">
        Оригинал: {lead.sourceName}
      </a>
      <p>
        Проверка: {lead.verifiedAt ? date(lead.verifiedAt, true) : 'не записана'}. Ручной контакт:{' '}
        {lead.contactedAt ? date(lead.contactedAt, true) : 'не записан'}.
      </p>
      {lead.consentEvidence && (
        <p>
          Основание согласия: {lead.consentEvidence}. Заказчик: {lead.clientId}.
        </p>
      )}
      {lead.projectId && (
        <Link className="text-link" href={`/projects/${lead.projectId}`}>
          Открыть созданный заказ →
        </Link>
      )}
      <p className="muted small-text">
        Это внутренний учёт действий человека. Программа не отправляет сообщения и не подтверждает
        согласие самостоятельно. Не сохраняйте пароли и лишние персональные данные.
      </p>
      <ActionFeedback error={error} success={success} />
      <form
        className="stack"
        aria-label="Действие по лиду"
        key={lead.version}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError('');
          setSuccess('');
          try {
            const reason = String(form.get('reason') || '');
            let fields: Record<string, unknown> = { reason };
            if (action === 'recordConsent')
              fields = { clientId: form.get('clientId'), evidence: reason };
            if (action === 'assignLead') fields.assignedToId = form.get('assignedToId');
            if (action === 'closeLead') fields.decision = form.get('decision');
            if (action === 'editLead')
              fields = {
                ...fields,
                title: form.get('title'),
                summary: form.get('summary'),
                sourceName: form.get('sourceName'),
                expiresAt: new Date(String(form.get('expiresAt'))).toISOString(),
              };
            await request('/api/admin/leads', {
              action,
              leadId: id,
              expectedVersion: lead.version,
              ...fields,
            });
            setData(await request<LeadDetailData>(url));
            await onSaved();
            setAction('addLeadNote');
            setSuccess('Действие записано в историю.');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Ошибка сохранения.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Действие
          <select name="action" value={action} onChange={(event) => setAction(event.target.value)}>
            {actions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {action === 'assignLead' && (
          <label className="field">
            Ответственный
            <select name="assignedToId" required defaultValue={lead.assignedToId}>
              {registry.operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {action === 'recordConsent' && (
          <label className="field">
            ID зарегистрированного заказчика
            <input name="clientId" required list={`clients-${id}`} autoComplete="off" />
            <datalist id={`clients-${id}`}>
              {registry.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </datalist>
            <small>
              Укажите именно владельца будущего задания. Он сам подтвердит передачу и заполнит ТЗ.
            </small>
          </label>
        )}
        {action === 'closeLead' && (
          <label className="field">
            Итог
            <select name="decision">
              <option value="declined">Отказ</option>
              <option value="archived">Архив</option>
            </select>
          </label>
        )}
        {action === 'editLead' && (
          <>
            <label className="field">
              Название
              <input
                name="title"
                required
                minLength={8}
                maxLength={140}
                defaultValue={lead.title}
              />
            </label>
            <label className="field">
              Суть запроса или обсуждения
              <textarea
                name="summary"
                required
                minLength={20}
                maxLength={2000}
                defaultValue={lead.summary}
              />
            </label>
            <label className="field">
              Название источника
              <input
                name="sourceName"
                required
                minLength={3}
                maxLength={120}
                defaultValue={lead.sourceName}
              />
            </label>
            <label className="field">
              Актуален до
              <input
                name="expiresAt"
                type="datetime-local"
                required
                defaultValue={localDate(lead.expiresAt)}
              />
            </label>
          </>
        )}
        <label className="field">
          {action === 'recordConsent'
            ? 'Основание согласия: кто, когда и на что согласился'
            : action === 'recordContact'
              ? 'Итог выполненного вручную контакта'
              : 'Обоснование или заметка'}
          <textarea name="reason" required minLength={10} maxLength={2000} />
        </label>
        <button className="button" disabled={busy}>
          Записать действие
        </button>
      </form>
      <details>
        <summary>История ({data.total})</summary>
        {data.events.map((event) => (
          <article className="summary-card" key={event.id}>
            <strong>
              Версия {event.version} · {event.action}
            </strong>
            <p>{event.note}</p>
            <p>
              {date(event.createdAt, true)} · автор {event.actorId}
            </p>
            {!!Object.keys(event.detailsJson).length && (
              <details>
                <summary>Подробности изменения</summary>
                {Object.entries(event.detailsJson).map(([key, value]) => (
                  <p key={key}>
                    <b>{key}</b>: {value}
                  </p>
                ))}
              </details>
            )}
          </article>
        ))}
        <div className="button-row">
          <button
            className="button secondary"
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            Новые события
          </button>
          <span>Страница {page}</span>
          <button
            className="button secondary"
            disabled={page * 20 >= data.total || busy}
            onClick={() => setPage(page + 1)}
          >
            Старые события
          </button>
        </div>
      </details>
    </section>
  );
}

export function LeadsPanel() {
  const createForm = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<LeadListData | null>(null),
    [page, setPage] = useState(1),
    [kind, setKind] = useState(''),
    [status, setStatus] = useState(''),
    [selected, setSelected] = useState('');
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false);
  const [defaultExpiry] = useState(() =>
    localDate(new Date(Date.now() + 30 * 86400000).toISOString()),
  );
  const url = `/api/admin/leads?page=${page}${kind ? `&kind=${kind}` : ''}${status ? `&status=${status}` : ''}`;
  const refresh = useCallback(async () => {
    try {
      setData(await request<LeadListData>(url));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка чтения.');
    }
  }, [url]);
  useEffect(() => {
    let active = true;
    void request<LeadListData>(url)
      .then((result) => {
        if (active) {
          setData(result);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Ошибка чтения.');
      });
    return () => {
      active = false;
    };
  }, [url]);
  if (!data) return <LoadState error={error} retry={refresh} />;
  return (
    <section className="stack content-intake" aria-label="Приватные лиды и обсуждения">
      <div className="panel stack">
        <h2>Приватные лиды и обсуждения</h2>
        <p>
          Найденный запрос ещё не является заказом. Сначала проверка и ручной контакт, затем
          согласие конкретного заказчика. Только он сможет создать обычный черновик.
        </p>
        <button className="button secondary" onClick={() => void refresh()}>
          Обновить реестр
        </button>
        <ActionFeedback error={error} success={success} />
      </div>
      <ThreadsSearch
        onChoose={(item) => {
          const form = createForm.current;
          if (!form || busy) return;
          const fields = ['sourceUrl', 'sourceName', 'title', 'summary'] as const;
          const inputs = fields.map(
            (name) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement,
          );
          if (inputs.some((input) => input.value.trim())) {
            setError(
              'В форме есть несохранённый текст. Сохраните его или очистите форму перед выбором публикации.',
            );
            return;
          }
          fields.forEach((name, index) => {
            inputs[index].value = item[name];
          });
          setError('');
          setSuccess(
            'Форма заполнена. Уточните тип, описание, ответственного и срок, затем сохраните кандидата.',
          );
          form.scrollIntoView({ block: 'start' });
        }}
      />
      <form
        ref={createForm}
        className="panel stack"
        aria-label="Новый приватный материал"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget,
            values = new FormData(form);
          setBusy(true);
          setError('');
          setSuccess('');
          try {
            const saved = await request<{ leadId: string }>('/api/admin/leads', {
              action: 'createLead',
              kind: values.get('kind'),
              sourceUrl: values.get('sourceUrl'),
              sourceName: values.get('sourceName'),
              title: values.get('title'),
              summary: values.get('summary'),
              assignedToId: values.get('assignedToId'),
              expiresAt: new Date(String(values.get('expiresAt'))).toISOString(),
            });
            await refresh();
            setSelected(saved.leadId);
            setSuccess('Кандидат учтён. Повтор ссылки не создаёт новую запись.');
            form.reset();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Ошибка сохранения.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>Добавить вручную</h3>
        <label className="field">
          Тип
          <select name="kind">
            <option value="business_request">Запрос бизнеса</option>
            <option value="discussion">Тематическое обсуждение</option>
          </select>
        </label>
        <label className="field">
          Ссылка на оригинал
          <input name="sourceUrl" type="url" required maxLength={2000} />
        </label>
        <label className="field">
          Название источника
          <input name="sourceName" required minLength={3} maxLength={120} />
        </label>
        <label className="field">
          Название
          <input name="title" required minLength={8} maxLength={140} />
        </label>
        <label className="field">
          Суть запроса или обсуждения
          <textarea name="summary" required minLength={20} maxLength={2000} />
        </label>
        <label className="field">
          Ответственный
          <select name="assignedToId" required defaultValue="">
            <option value="" disabled>
              Выберите администратора
            </option>
            {data.operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Актуален до
          <input name="expiresAt" type="datetime-local" required defaultValue={defaultExpiry} />
          <small>
            Срок внутренней проверки, максимум 90 дней. Это не обещание или дедлайн заказчика.
          </small>
        </label>
        <button className="button" disabled={busy}>
          Добавить в приватный реестр
        </button>
        <button className="button secondary" type="reset" disabled={busy}>
          Очистить форму
        </button>
      </form>
      <div className="panel stack">
        <h3>Записи: {data.total}</h3>
        {selected && !data.leads.some((lead) => lead.id === selected) && (
          <LeadRecord
            key={selected}
            id={selected}
            registry={data}
            onSaved={refresh}
            onClose={() => setSelected('')}
          />
        )}
        <div className="form-grid">
          <label className="field">
            Тип материала
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Все типы</option>
              <option value="business_request">Запросы бизнеса</option>
              <option value="discussion">Обсуждения</option>
            </select>
          </label>
          <label className="field">
            Стадия
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Все стадии</option>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {data.leads.map((lead) => (
          <Fragment key={lead.id}>
            <article className="summary-card stack">
              <strong>{lead.title}</strong>
              <p>
                {labels[lead.status]} ·{' '}
                {lead.kind === 'discussion' ? 'Обсуждение' : 'Бизнес-запрос'}
              </p>
              <p>
                Ответственный:{' '}
                {data.operators.find((operator) => operator.id === lead.assignedToId)?.name ??
                  lead.assignedToId}
                . До {date(lead.expiresAt, true)}.
              </p>
              <button className="button secondary" onClick={() => setSelected(lead.id)}>
                Открыть карточку лида
              </button>
            </article>
            {selected === lead.id && (
              <LeadRecord
                key={selected}
                id={selected}
                registry={data}
                onSaved={refresh}
                onClose={() => setSelected('')}
              />
            )}
          </Fragment>
        ))}
        <div className="button-row">
          <button
            className="button secondary"
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            Назад
          </button>
          <span>Страница {page}</span>
          <button
            className="button secondary"
            disabled={page * 20 >= data.total || busy}
            onClick={() => setPage(page + 1)}
          >
            Далее
          </button>
        </div>
      </div>
    </section>
  );
}
