'use client';
import { MarketplaceMessage, useMarketplaceCopy } from './marketplace-copy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, LockKeyhole, Upload } from 'lucide-react';
import type { z } from 'zod';
import {
  projectAttachmentSchema,
  projectAttachmentListSchema,
  projectAttachmentMutationSchema,
  projectAttachmentDeleteSchema,
} from '@/contracts/project-attachments';
import { clientData } from '@/lib/client-data-response';
import { date } from '@/lib/labels';
import { useViewer } from './platform';
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES } from '@/lib/project-attachments';

type Attachment = z.infer<typeof projectAttachmentSchema>;
const fileSize = (bytes: number, locale: 'ru' | 'kk') =>
  `${new Intl.NumberFormat(locale === 'kk' ? 'kk-KZ' : 'ru-KZ', { maximumFractionDigits: 1 }).format(bytes / 1024)} КБ`;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие с файлом.';
class AttachmentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function requestFileJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  }).catch(() => {
    throw new Error(
      init?.method
        ? 'Операция с файлом не подтверждена. Обновите список перед повторной попыткой.'
        : 'Не удалось загрузить список файлов. Проверьте соединение и повторите попытку.',
    );
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new AttachmentRequestError(
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Файл недоступен или сервер временно не отвечает.',
      response.status,
    );
  return body;
}

/** Keep private metadata and late replies scoped to both the account and the project. */
export function useProjectAttachments(projectId: string, enabled: boolean) {
  const viewer = useViewer();
  const key = enabled && viewer ? `${viewer.id}:${projectId}` : null;
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/attachments`;
  const active = useRef<string | null>(null);
  const pending = useRef<string | null>(null);
  const version = useRef(0);
  const [state, setState] = useState<{
    key: string | null;
    files: Attachment[] | null;
    loading: boolean;
    error: string;
  }>({ key: null, files: null, loading: true, error: '' });
  const [notice, setNotice] = useState({ key: null as string | null, message: '' });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!key || pending.current === key) return;
    const request = ++version.current;
    setState((previous) => ({
      key,
      files: previous.key === key ? previous.files : null,
      loading: true,
      error: '',
    }));
    try {
      const files = clientData(
        projectAttachmentListSchema,
        await requestFileJson(endpoint),
      ).attachments;
      if (active.current === key && version.current === request)
        setState({ key, files, loading: false, error: '' });
    } catch (error) {
      if (active.current === key && version.current === request)
        setState({ key, files: null, loading: false, error: errorMessage(error) });
    }
  }, [key, endpoint]);
  useEffect(() => {
    active.current = key;
    if (key) void refresh();
    const focused = () => void refresh();
    if (key) window.addEventListener('focus', focused);
    return () => {
      active.current = null;
      window.removeEventListener('focus', focused);
    };
  }, [key, refresh]);

  const mutate = useCallback(
    async (operation: 'upload' | 'remove', value: File | string) => {
      if (!key || pending.current === key) return false;
      pending.current = key;
      setBusyKey(key);
      setNotice({ key, message: '' });
      const request = ++version.current;
      let committed = false;
      try {
        if (operation === 'upload') {
          const file = value as File;
          if (!file.size || file.size > MAX_ATTACHMENT_BYTES)
            throw new Error('Выберите непустой файл размером не больше 5 МиБ.');
          const body = await requestFileJson(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'X-File-Name': encodeURIComponent(file.name),
            },
            body: file,
          });
          clientData(projectAttachmentMutationSchema, body, true);
        } else {
          clientData(
            projectAttachmentDeleteSchema,
            await requestFileJson(`/api/attachments/${encodeURIComponent(value as string)}`, {
              method: 'DELETE',
            }),
            true,
          );
        }
        committed = true;
        if (active.current !== key || version.current !== request) return false;
        const files = clientData(
          projectAttachmentListSchema,
          await requestFileJson(endpoint),
        ).attachments;
        if (active.current !== key || version.current !== request) return false;
        setState({ key, files, loading: false, error: '' });
        setNotice({
          key,
          message:
            operation === 'upload'
              ? 'Файл загружен в закрытую рабочую область. Сдача результата выполняется отдельно.'
              : 'Неприкреплённый файл удалён.',
        });
        return true;
      } catch (error) {
        if (active.current === key && version.current === request)
          setState((previous) => ({
            key,
            files:
              error instanceof AttachmentRequestError && [401, 403, 404].includes(error.status)
                ? null
                : previous.key === key
                  ? previous.files
                  : null,
            loading: false,
            error: committed
              ? 'Изменение файла выполнено, но список не обновился. Повторите загрузку списка.'
              : errorMessage(error),
          }));
        return false;
      } finally {
        if (pending.current === key) pending.current = null;
        setBusyKey((previous) => (previous === key ? null : previous));
      }
    },
    [key, endpoint],
  );
  const current = key && state.key === key;
  return {
    enabled: !!key,
    ownerId: viewer?.id,
    files: current ? state.files : null,
    loading: !!key && (!current || state.loading),
    busy: !!key && busyKey === key,
    error: current ? state.error : '',
    success: key && notice.key === key ? notice.message : '',
    refresh,
    upload: (file: File) => mutate('upload', file),
    remove: (id: string) => mutate('remove', id),
  };
}

export type ProjectAttachmentsState = ReturnType<typeof useProjectAttachments>;

export function AttachmentDownload({ file }: { file: Attachment }) {
  const { locale, copy } = useMarketplaceCopy();
  return (
    <a className="external-link" href={`/api/attachments/${encodeURIComponent(file.id)}`} download>
      <Download size={14} aria-hidden="true" /> {copy('Скачать')}{' '}
      <span lang="und">{file.filename}</span> ({fileSize(file.byteSize, locale)})
    </a>
  );
}

export function ProjectAttachmentsPanel({
  state,
  mayUpload,
  disabled = false,
}: {
  state: ProjectAttachmentsState;
  mayUpload: boolean;
  disabled?: boolean;
}) {
  const { locale, copy } = useMarketplaceCopy();
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="panel stack" lang={locale} aria-label={copy('Закрытые файлы проекта')}>
      <div className="section-title">
        <h2>{copy('Закрытые файлы проекта')}</h2>
        <LockKeyhole size={18} className="muted" aria-hidden="true" />
      </div>
      <p className="muted small-text">
        {copy(
          'Файлы доступны только заказчику и назначенному исполнителю. Они не попадают в публичное портфолио. Загрузка сразу открывает файл второму участнику, но не заменяет сдачу результата.',
        )}
      </p>
      <p className="alert warning">
        {copy(
          'Антивирусная проверка не выполнялась. Скачивайте только ожидаемые файлы от участника, которому доверяете, и проверяйте их перед открытием.',
        )}
      </p>
      {!state.enabled ? (
        <p>{copy('Передача файлов станет доступна после обоюдного подтверждения условий.')}</p>
      ) : (
        <>
          {state.error && (
            <div className="alert error" role="alert">
              <p>
                <MarketplaceMessage text={state.error} />
              </p>
              <button
                className="button secondary"
                type="button"
                disabled={state.busy || disabled}
                onClick={() => void state.refresh()}
              >
                {copy('Обновить список файлов')}
              </button>
            </div>
          )}
          {state.success && (
            <p role="status">
              <MarketplaceMessage text={state.success} />
            </p>
          )}
          {state.loading && <p role="status">{copy('Загрузка списка файлов…')}</p>}
          {state.busy && <p role="status">{copy('Операция с файлом выполняется…')}</p>}
          {mayUpload ? (
            <form
              className="stack"
              aria-label={copy('Загрузка закрытого файла')}
              onSubmit={async (event) => {
                event.preventDefault();
                const file = input.current?.files?.[0];
                if (file && (await state.upload(file)) && input.current) input.current.value = '';
              }}
            >
              <label className="field">
                {copy('Файл проекта')}{' '}
                <input
                  ref={input}
                  type="file"
                  name="file"
                  required
                  accept={ATTACHMENT_ACCEPT}
                  disabled={state.busy || disabled}
                />
                <small>
                  {copy(
                    'PDF, PNG, JPEG или UTF-8 TXT; до 5 МиБ на файл, до 20 файлов и 50 МиБ на проект. Используйте обезличенные материалы, которыми вправе делиться.',
                  )}
                </small>
              </label>
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={state.busy || disabled}
                  type="submit"
                >
                  <Upload size={15} aria-hidden="true" /> {copy('Загрузить закрытый файл')}
                </button>
              </div>
            </form>
          ) : (
            <p className="muted small-text">
              {copy('Загрузка доступна во время выполнения и доработки заказа.')}
            </p>
          )}
          {state.files && !state.files.length && !state.loading && (
            <p>{copy('Файлов проекта пока нет.')}</p>
          )}
          <div className="stack">
            {state.files?.map((file) => (
              <article className="submission stack" key={file.id}>
                <AttachmentDownload file={file} />
                <p className="muted small-text">
                  {file.uploaderId === state.ownerId
                    ? copy('Ваш файл')
                    : copy('Файл второго участника')}{' '}
                  · {date(file.createdAt, true, locale)} {copy('· без антивирусной проверки')}
                </p>
                {file.submissionIds.length ? (
                  <p className="small-text">
                    {copy('В истории сдачи:')} {file.submissionIds.length}
                    {copy('. Удаление запрещено.')}
                  </p>
                ) : file.uploaderId === state.ownerId ? (
                  <div className="button-row">
                    <button
                      className="button secondary small"
                      type="button"
                      disabled={state.busy || disabled}
                      onClick={() => void state.remove(file.id)}
                    >
                      <span className="pre-wrap">
                        {copy('Удалить')} {file.filename}
                      </span>
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
