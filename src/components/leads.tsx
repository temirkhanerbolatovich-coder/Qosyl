'use client';
import { useMarketplaceCopy } from './marketplace-copy';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ThreadsSearch } from './threads-search';
import {
  leadListDataSchema,
  leadDetailDataSchema,
  leadMutationDataSchema,
  type LeadListData,
  type LeadDetailData,
} from '@/contracts/leads';
import { requestClientData, CLIENT_WRITE_REFRESH_ERROR } from '@/lib/client-data-response';
import type { z } from 'zod';
import { adminCodeLabel } from '@/lib/admin-labels';
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
async function request<S extends z.ZodType>(
  schema: S,
  url: string,
  body?: Record<string, unknown>,
) {
  return requestClientData(
    schema,
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
}
function LeadRecord({
  id,
  registry,
  onSaved,
  onClose,
}: {
  id: string;
  registry: LeadListData;
  onSaved: () => Promise<boolean>;
  onClose: () => void;
}) {
  const { locale, copy } = useMarketplaceCopy();
  const [data, setData] = useState<LeadDetailData | null>(null),
    [page, setPage] = useState(1),
    [action, setAction] = useState('addLeadNote');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const url = `/api/admin/leads/${encodeURIComponent(id)}?page=${page}`;
  useEffect(() => {
    let active = true;
    void request(leadDetailDataSchema, url)
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
  async function reloadDetail() {
    if (busy) return;
    setBusy(true);
    try {
      setData(await request(leadDetailDataSchema, url));
      setError('');
      setSuccess('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ошибка чтения.');
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <LoadState error={error} retry={reloadDetail} />;
  const lead = data.lead;
  const actions = [
    ['addLeadNote', copy('Добавить заметку')],
    ['assignLead', copy('Сменить ответственного')],
  ];
  if (lead.status === 'new')
    actions.push(
      ['editLead', copy('Исправить описание и срок')],
      ['verifyLead', copy('Зафиксировать проверку')],
    );
  if (lead.status === 'verified')
    actions.push(['recordContact', copy('Записать итог ручного контакта')]);
  if (lead.status === 'contacted' && lead.kind === 'business_request')
    actions.push(['recordConsent', copy('Записать согласие и передать заказчику')]);
  if (lead.status === 'consented') actions.push(['revokeConsent', copy('Отозвать передачу')]);
  if (lead.status !== 'converted') {
    actions.push(['closeLead', copy('Зафиксировать отказ или архив')]);
    if (lead.status !== 'new') actions.push(['reopenLead', copy('Вернуть на проверку')]);
  }
  return (
    <section
      lang={locale}
      className="panel stack content-editor"
      aria-label={copy('Карточка приватного лида')}
    >
      <div className="button-row">
        <h3>
          <span lang="und">{lead.title}</span>
        </h3>
        <button className="button secondary" disabled={busy} onClick={() => void reloadDetail()}>
          {copy('Обновить карточку')}
        </button>
        <button className="button secondary" onClick={onClose}>
          {copy('Закрыть карточку')}
        </button>
      </div>
      <p>
        {copy(labels[lead.status])} {copy('· версия')} {lead.version} {copy('· актуален до')}{' '}
        {date(lead.expiresAt, true, locale)}
      </p>
      <p>
        <span lang="und">{lead.summary}</span>
      </p>
      <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer">
        {copy('Оригинал:')} <span lang="und">{lead.sourceName}</span>
      </a>
      <p>
        {copy('Проверка:')}{' '}
        {lead.verifiedAt ? date(lead.verifiedAt, true, locale) : copy('не записана')}
        {copy('. Ручной контакт:')}{' '}
        {lead.contactedAt ? date(lead.contactedAt, true, locale) : copy('не записан')}.
      </p>
      {lead.consentEvidence && (
        <p>
          {copy('Основание согласия:')} <span lang="und">{lead.consentEvidence}</span>
          {copy('. Заказчик:')} {lead.clientId}.
        </p>
      )}
      {lead.projectId && (
        <Link className="text-link" href={`/projects/${lead.projectId}`}>
          {copy('Открыть созданный заказ →')}
        </Link>
      )}
      <p className="muted small-text">
        {copy(
          'Это внутренний учёт действий человека. Программа не отправляет сообщения и не подтверждает согласие самостоятельно. Не сохраняйте пароли и лишние персональные данные.',
        )}
      </p>
      <ActionFeedback error={error} success={success} />
      <form
        className="stack"
        aria-label={copy('Действие по лиду')}
        key={lead.version}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError('');
          setSuccess('');
          let committed = false;
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
            await request(leadMutationDataSchema, '/api/admin/leads', {
              action,
              leadId: id,
              expectedVersion: lead.version,
              ...fields,
            });
            committed = true;
            const updated = await request(leadDetailDataSchema, url);
            if (!(await onSaved())) throw new Error(CLIENT_WRITE_REFRESH_ERROR);
            setData(updated);
            setAction('addLeadNote');
            setSuccess('Действие записано в историю.');
          } catch (e) {
            setError(
              committed
                ? CLIENT_WRITE_REFRESH_ERROR
                : e instanceof Error
                  ? e.message
                  : 'Ошибка сохранения.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          {copy('Действие')}{' '}
          <select name="action" value={action} onChange={(event) => setAction(event.target.value)}>
            {actions.map(([value, label]) => (
              <option key={value} value={value}>
                {copy(label)}
              </option>
            ))}
          </select>
        </label>
        {action === 'assignLead' && (
          <label className="field">
            {copy('Ответственный')}{' '}
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
            {copy('ID зарегистрированного заказчика')}{' '}
            <input name="clientId" required list={`clients-${id}`} autoComplete="off" />
            <datalist id={`clients-${id}`}>
              {registry.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </datalist>
            <small>
              {copy(
                'Укажите именно владельца будущего задания. Он сам подтвердит передачу и заполнит ТЗ.',
              )}
            </small>
          </label>
        )}
        {action === 'closeLead' && (
          <label className="field">
            {copy('Итог')}{' '}
            <select name="decision">
              <option value="declined">{copy('Отказ')}</option>
              <option value="archived">{copy('Архив')}</option>
            </select>
          </label>
        )}
        {action === 'editLead' && (
          <>
            <label className="field">
              {copy('Название')}{' '}
              <input
                name="title"
                required
                minLength={8}
                maxLength={140}
                defaultValue={lead.title}
              />
            </label>
            <label className="field">
              {copy('Суть запроса или обсуждения')}{' '}
              <textarea
                name="summary"
                required
                minLength={20}
                maxLength={2000}
                defaultValue={lead.summary}
              />
            </label>
            <label className="field">
              {copy('Название источника')}{' '}
              <input
                name="sourceName"
                required
                minLength={3}
                maxLength={120}
                defaultValue={lead.sourceName}
              />
            </label>
            <label className="field">
              {copy('Актуален до')}{' '}
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
            ? copy('Основание согласия: кто, когда и на что согласился')
            : action === 'recordContact'
              ? copy('Итог выполненного вручную контакта')
              : copy('Обоснование или заметка')}
          <textarea name="reason" required minLength={10} maxLength={2000} />
        </label>
        <button className="button" disabled={busy}>
          {copy('Записать действие')}
        </button>
      </form>
      <details>
        <summary>
          {copy('История (')}
          {data.total})
        </summary>
        {data.events.map((event) => (
          <article className="summary-card" key={event.id}>
            <strong>
              {copy('Версия')} {event.version} · {adminCodeLabel(event.action, locale)}
            </strong>
            <p>
              <span lang="und">{event.note}</span>
            </p>
            <p>
              {date(event.createdAt, true, locale)} {copy('· автор')} {event.actorId}
            </p>
            {!!Object.keys(event.detailsJson).length && (
              <details>
                <summary>{copy('Подробности изменения')}</summary>
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
            {copy('Новые события')}
          </button>
          <span>
            {copy('Страница')} {page}
          </span>
          <button
            className="button secondary"
            disabled={page * 20 >= data.total || busy}
            onClick={() => setPage(page + 1)}
          >
            {copy('Старые события')}
          </button>
        </div>
      </details>
    </section>
  );
}

export function LeadsPanel() {
  const { locale, copy } = useMarketplaceCopy();
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
      setData(await request(leadListDataSchema, url));
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка чтения.');
      return false;
    }
  }, [url]);
  useEffect(() => {
    let active = true;
    void request(leadListDataSchema, url)
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
    <section
      lang={locale}
      className="stack content-intake"
      aria-label={copy('Приватные лиды и обсуждения')}
    >
      <div className="panel stack">
        <h2>{copy('Приватные лиды и обсуждения')}</h2>
        <p>
          {copy(
            'Найденный запрос ещё не является заказом. Сначала проверка и ручной контакт, затем согласие конкретного заказчика. Только он сможет создать обычный черновик.',
          )}
        </p>
        <button className="button secondary" onClick={() => void refresh()}>
          {copy('Обновить реестр')}
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
        aria-label={copy('Новый приватный материал')}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget,
            values = new FormData(form);
          setBusy(true);
          setError('');
          setSuccess('');
          let committed = false;
          try {
            const saved = await request(leadMutationDataSchema, '/api/admin/leads', {
              action: 'createLead',
              kind: values.get('kind'),
              sourceUrl: values.get('sourceUrl'),
              sourceName: values.get('sourceName'),
              title: values.get('title'),
              summary: values.get('summary'),
              assignedToId: values.get('assignedToId'),
              expiresAt: new Date(String(values.get('expiresAt'))).toISOString(),
            });
            committed = true;
            if (!(await refresh())) throw new Error(CLIENT_WRITE_REFRESH_ERROR);
            setSelected(saved.leadId);
            setSuccess('Кандидат учтён. Повтор ссылки не создаёт новую запись.');
            form.reset();
          } catch (e) {
            setError(
              committed
                ? CLIENT_WRITE_REFRESH_ERROR
                : e instanceof Error
                  ? e.message
                  : 'Ошибка сохранения.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>{copy('Добавить вручную')}</h3>
        <label className="field">
          {copy('Тип')}{' '}
          <select name="kind">
            <option value="business_request">{copy('Запрос бизнеса')}</option>
            <option value="discussion">{copy('Тематическое обсуждение')}</option>
          </select>
        </label>
        <label className="field">
          {copy('Ссылка на оригинал')}{' '}
          <input name="sourceUrl" type="url" required maxLength={2000} />
        </label>
        <label className="field">
          {copy('Название источника')}{' '}
          <input name="sourceName" required minLength={3} maxLength={120} />
        </label>
        <label className="field">
          {copy('Название')} <input name="title" required minLength={8} maxLength={140} />
        </label>
        <label className="field">
          {copy('Суть запроса или обсуждения')}{' '}
          <textarea name="summary" required minLength={20} maxLength={2000} />
        </label>
        <label className="field">
          {copy('Ответственный')}{' '}
          <select name="assignedToId" required defaultValue="">
            <option value="" disabled>
              {copy('Выберите администратора')}
            </option>
            {data.operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {copy('Актуален до')}{' '}
          <input name="expiresAt" type="datetime-local" required defaultValue={defaultExpiry} />
          <small>
            {copy(
              'Срок внутренней проверки, максимум 90 дней. Это не обещание или дедлайн заказчика.',
            )}
          </small>
        </label>
        <button className="button" disabled={busy}>
          {copy('Добавить в приватный реестр')}
        </button>
        <button className="button secondary" type="reset" disabled={busy}>
          {copy('Очистить форму')}
        </button>
      </form>
      <div className="panel stack">
        <h3>
          {copy('Записи:')} {data.total}
        </h3>
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
            {copy('Тип материала')}{' '}
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{copy('Все типы')}</option>
              <option value="business_request">{copy('Запросы бизнеса')}</option>
              <option value="discussion">{copy('Обсуждения')}</option>
            </select>
          </label>
          <label className="field">
            {copy('Стадия')}{' '}
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{copy('Все стадии')}</option>
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
              <strong>
                <span lang="und">{lead.title}</span>
              </strong>
              <p>
                {copy(labels[lead.status])} ·{' '}
                {lead.kind === 'discussion' ? copy('Обсуждение') : copy('Бизнес-запрос')}
              </p>
              <p>
                {copy('Ответственный:')}{' '}
                {data.operators.find((operator) => operator.id === lead.assignedToId)?.name ??
                  lead.assignedToId}{' '}
                {copy('. До')} {date(lead.expiresAt, true, locale)}.
              </p>
              <button className="button secondary" onClick={() => setSelected(lead.id)}>
                {copy('Открыть карточку лида')}
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
            {copy('Назад')}
          </button>
          <span>
            {copy('Страница')} {page}
          </span>
          <button
            className="button secondary"
            disabled={page * 20 >= data.total || busy}
            onClick={() => setPage(page + 1)}
          >
            {copy('Далее')}
          </button>
        </div>
      </div>
    </section>
  );
}
