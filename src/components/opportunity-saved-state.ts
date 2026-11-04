'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import type { opportunitySavedCommand } from '@/lib/opportunity-saved';
import {
  opportunitySavedDataSchema,
  opportunitySavedMutationSchema,
  type OpportunitySavedData,
} from '@/contracts/opportunity-saved';
import { useViewer } from './platform';
import { useI18n } from './locale-provider';
import { savedServerFeedback } from '@/lib/opportunity-saved-feedback';

type SavedCommand = z.infer<typeof opportunitySavedCommand>;
class SavedRequestError extends Error {
  constructor(
    message: string,
    readonly accessExpired = false,
  ) {
    super(message);
  }
}
async function requestSaved(command?: SavedCommand) {
  const response = await fetch('/api/opportunities/saved', {
    method: command ? 'POST' : 'GET',
    cache: 'no-store',
    headers: command ? { 'Content-Type': 'application/json' } : undefined,
    body: command ? JSON.stringify(command) : undefined,
    signal: AbortSignal.timeout(20000),
  }).catch(() => {
    throw new SavedRequestError(
      command
        ? 'Сохранение не подтверждено. Обновите список перед повторной попыткой.'
        : 'Не удалось загрузить сохранённое. Проверьте соединение и повторите попытку.',
    );
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new SavedRequestError(
      typeof body?.error === 'string'
        ? body.error
        : 'Не удалось загрузить сохранённое. Повторите попытку.',
      response.status === 401 || response.status === 403,
    );
  return body?.data;
}
async function readSaved() {
  const parsed = opportunitySavedDataSchema.safeParse(await requestSaved());
  if (!parsed.success) throw new Error('Не удалось прочитать сохранённое. Повторите попытку.');
  return parsed.data;
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие.';
const localErrorKk: Record<string, string> = {
  'Сохранение не подтверждено. Обновите список перед повторной попыткой.':
    'Сақтау расталмады. Қайта әрекеттенбес бұрын тізімді жаңартыңыз.',
  'Не удалось загрузить сохранённое. Проверьте соединение и повторите попытку.':
    'Сақталғандарды жүктеу мүмкін болмады. Байланысты тексеріп, қайталаңыз.',
  'Не удалось загрузить сохранённое. Повторите попытку.':
    'Сақталғандарды жүктеу мүмкін болмады. Қайталап көріңіз.',
  'Не удалось прочитать сохранённое. Повторите попытку.':
    'Сақталғандарды оқу мүмкін болмады. Қайталап көріңіз.',
  'Не удалось выполнить действие.': 'Әрекетті орындау мүмкін болмады.',
  'Ответ сервера не подтверждает сохранение. Обновите список.':
    'Сервер жауабы сақтауды растамайды. Тізімді жаңартыңыз.',
  'Изменение сохранено, но список не обновился. Повторите загрузку.':
    'Өзгеріс сақталды, бірақ тізім жаңармады. Қайта жүктеңіз.',
};
const successMessages: Record<SavedCommand['action'], readonly [string, string]> = {
  saveFavorite: ['Возможность добавлена в избранное.', 'Мүмкіндік таңдаулыларға қосылды.'],
  removeFavorite: ['Возможность убрана из избранного.', 'Мүмкіндік таңдаулылардан алынды.'],
  saveSearch: ['Поиск сохранён.', 'Іздеу сақталды.'],
  removeSearch: ['Поиск удалён.', 'Іздеу жойылды.'],
  setSearchNotifications: ['Настройки уведомлений сохранены.', 'Хабарландыру баптаулары сақталды.'],
};

/** Keep private responses scoped to their account, including after account changes in this tab. */
export function useOpportunitySaved(enabled = true) {
  const { locale, t } = useI18n();
  const viewer = useViewer();
  const owner = enabled ? (viewer?.id ?? null) : null;
  const activeOwner = useRef<string | null>(null);
  const pendingOwner = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const [state, setState] = useState<{
    owner: string | null;
    data: OpportunitySavedData | null;
    loading: boolean;
    error: string;
    accessExpired: boolean;
  }>({ owner: null, data: null, loading: true, error: '', accessExpired: false });
  const [busyOwner, setBusyOwner] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    owner: string | null;
    action: SavedCommand['action'] | null;
  }>({ owner: null, action: null });
  useEffect(() => {
    activeOwner.current = owner;
    let active = true;
    async function load() {
      if (!owner || pendingOwner.current === owner) return;
      const request = ++requestVersion.current;
      try {
        const data = await readSaved();
        if (active && request === requestVersion.current)
          setState({ owner, data, loading: false, error: '', accessExpired: false });
      } catch (error) {
        if (active && request === requestVersion.current)
          setState({
            owner,
            data: null,
            loading: false,
            error: message(error),
            accessExpired: error instanceof SavedRequestError && error.accessExpired,
          });
      }
    }
    if (owner) void load();
    const timer = owner ? setInterval(() => void load(), 15000) : undefined;
    const focused = () => void load();
    if (owner) window.addEventListener('focus', focused);
    return () => {
      active = false;
      activeOwner.current = null;
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', focused);
    };
  }, [owner]);
  const refresh = useCallback(async () => {
    if (!owner || pendingOwner.current === owner) return;
    const request = ++requestVersion.current;
    setState((previous) => ({
      owner,
      data: previous.owner === owner ? previous.data : null,
      loading: true,
      error: '',
      accessExpired: false,
    }));
    try {
      const data = await readSaved();
      if (activeOwner.current === owner && request === requestVersion.current)
        setState({ owner, data, loading: false, error: '', accessExpired: false });
    } catch (error) {
      if (activeOwner.current === owner && request === requestVersion.current)
        setState({
          owner,
          data: null,
          loading: false,
          error: message(error),
          accessExpired: error instanceof SavedRequestError && error.accessExpired,
        });
    }
  }, [owner]);
  const mutate = useCallback(
    async (command: SavedCommand) => {
      if (!owner || pendingOwner.current === owner) return false;
      pendingOwner.current = owner;
      const request = ++requestVersion.current;
      setBusyOwner(owner);
      setNotice({ owner, action: null });
      let committed = false;
      try {
        const result = opportunitySavedMutationSchema.safeParse(await requestSaved(command));
        if (!result.success)
          throw new Error('Ответ сервера не подтверждает сохранение. Обновите список.');
        committed = true;
        if (activeOwner.current !== owner || request !== requestVersion.current) return false;
        const data = await readSaved();
        if (activeOwner.current !== owner || request !== requestVersion.current) return false;
        setState({ owner, data, loading: false, error: '', accessExpired: false });
        setNotice({
          owner,
          action: command.action,
        });
        return true;
      } catch (error) {
        if (activeOwner.current === owner && request === requestVersion.current)
          setState((previous) => ({
            owner,
            data:
              error instanceof SavedRequestError && error.accessExpired
                ? null
                : previous.owner === owner
                  ? previous.data
                  : null,
            loading: false,
            error: committed
              ? 'Изменение сохранено, но список не обновился. Повторите загрузку.'
              : message(error),
            accessExpired: error instanceof SavedRequestError && error.accessExpired,
          }));
        return false;
      } finally {
        if (pendingOwner.current === owner) pendingOwner.current = null;
        setBusyOwner((previous) => (previous === owner ? null : previous));
      }
    },
    [owner],
  );
  const current = state.owner === owner;
  const rawError = current ? state.error : '';
  const localError = Object.hasOwn(localErrorKk, rawError);
  const serverFeedback = savedServerFeedback(rawError, locale);
  const error = localError ? t(rawError, localErrorKk[rawError]) : serverFeedback.text;
  const success = notice.action ? t(...successMessages[notice.action]) : '';
  return {
    signedIn: !!owner,
    data: current && !state.accessExpired ? state.data : null,
    loading: !!owner && (!current || state.loading),
    error,
    errorLanguage: localError ? locale : serverFeedback.language,
    originalError: !localError && serverFeedback.original,
    success: current && !state.accessExpired && notice.owner === owner ? success : '',
    accessExpired: current && state.accessExpired,
    busy: !!owner && busyOwner === owner,
    mutate,
    refresh,
  };
}
export type OpportunitySavedState = ReturnType<typeof useOpportunitySaved>;
