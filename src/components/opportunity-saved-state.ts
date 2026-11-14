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
import { useToast } from './toast-provider';
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
  setFavoriteReminder: ['Напоминание сохранено.', 'Еске салу сақталды.'],
  setFavoriteNote: ['Заметка сохранена.', 'Жазба сақталды.'],
  removeSearch: ['Поиск удалён.', 'Іздеу жойылды.'],
  setSearchNotifications: ['Настройки уведомлений сохранены.', 'Хабарландыру баптаулары сақталды.'],
};

type MutateOptions = { silent?: boolean };
type Latest = {
  current: {
    data: OpportunitySavedData | null;
    t: (ru: string, kk: string) => string;
    toast: ReturnType<typeof useToast>;
  };
};

/**
 * Confirms a saved change in a toast. Adding or removing a favorite and removing a search can be
 * undone; undoing a removal also restores the note, reminder and notification frequency.
 */
function announce(
  command: SavedCommand,
  before: OpportunitySavedData | null,
  after: OpportunitySavedData,
  latest: Latest,
  mutateRef: { current: (command: SavedCommand, options?: MutateOptions) => Promise<boolean> },
) {
  const { t, toast } = latest.current;
  const run = (next: SavedCommand) => mutateRef.current(next, { silent: true });
  // Undo reports whether it worked; a failure leaves its error inline and no confirmation toast.
  let undo: (() => Promise<boolean>) | undefined;
  if (command.action === 'saveFavorite') {
    const added = after.favorites.find((favorite) => favorite.itemId === command.itemId);
    if (added) undo = () => run({ action: 'removeFavorite', favoriteId: added.id });
  } else if (command.action === 'removeFavorite') {
    const removed = before?.favorites.find((favorite) => favorite.id === command.favoriteId);
    if (removed)
      undo = async () => {
        if (!(await run({ action: 'saveFavorite', itemId: removed.itemId }))) return false;
        const restored = (await readSaved().catch(() => null))?.favorites.find(
          (favorite) => favorite.itemId === removed.itemId,
        );
        if (!restored) return true;
        if (removed.note)
          await run({ action: 'setFavoriteNote', favoriteId: restored.id, note: removed.note });
        if (removed.reminderDaysBefore)
          await run({
            action: 'setFavoriteReminder',
            favoriteId: restored.id,
            daysBefore: removed.reminderDaysBefore,
          });
        return true;
      };
  } else if (command.action === 'removeSearch') {
    const removed = before?.searches.find((search) => search.id === command.searchId);
    if (removed)
      undo = async () => {
        if (!(await run({ action: 'saveSearch', name: removed.name, filters: removed.filters })))
          return false;
        if (removed.notificationFrequency === 'off') return true;
        const restored = (await readSaved().catch(() => null))?.searches
          .filter((search) => search.name === removed.name)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (restored)
          await run({
            action: 'setSearchNotifications',
            searchId: restored.id,
            frequency: removed.notificationFrequency,
          });
        return true;
      };
  }
  // Following a search says what will happen, since the toast is the only explanation.
  const following =
    command.action === 'saveSearch' && command.frequency && command.frequency !== 'off';
  if (following) {
    const created = after.searches
      .filter((search) => search.name === command.name)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (created) undo = () => run({ action: 'removeSearch', searchId: created.id });
  }
  toast.show({
    text: following
      ? t(
          'Вы следите за поиском. Новые совпадения придут в уведомления раз в сутки.',
          'Сіз іздеуді қадағалап отырсыз. Жаңа сәйкестіктер тәулігіне бір рет хабарламада келеді.',
        )
      : t(...successMessages[command.action]),
    actionLabel: undo ? t('Отменить', 'Болдырмау') : undefined,
    onAction: undo
      ? async () => {
          if (await undo()) toast.show({ text: t('Действие отменено.', 'Әрекет болдырылмады.') });
        }
      : undefined,
  });
}

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
  const toast = useToast();
  // Undo steps run later than the render that created them, so they read the latest values here.
  const latest = useRef({ data: null as OpportunitySavedData | null, t, toast });
  latest.current = { data: state.data, t, toast };
  const mutateRef = useRef<(command: SavedCommand, options?: MutateOptions) => Promise<boolean>>(
    async () => false,
  );
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
    async (command: SavedCommand, options: MutateOptions = {}) => {
      if (!owner || pendingOwner.current === owner) return false;
      pendingOwner.current = owner;
      const request = ++requestVersion.current;
      setBusyOwner(owner);
      // What a removal deletes is read before it happens, so undo can put it back.
      const before = latest.current.data;
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
        if (!options.silent) announce(command, before, data, latest, mutateRef);
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
  mutateRef.current = mutate;
  const current = state.owner === owner;
  const rawError = current ? state.error : '';
  const localError = Object.hasOwn(localErrorKk, rawError);
  const serverFeedback = savedServerFeedback(rawError, locale);
  const error = localError ? t(rawError, localErrorKk[rawError]) : serverFeedback.text;

  return {
    signedIn: !!owner,
    data: current && !state.accessExpired ? state.data : null,
    loading: !!owner && (!current || state.loading),
    error,
    errorLanguage: localError ? locale : serverFeedback.language,
    originalError: !localError && serverFeedback.original,
    accessExpired: current && state.accessExpired,
    busy: !!owner && busyOwner === owner,
    mutate,
    refresh,
  };
}
export type OpportunitySavedState = ReturnType<typeof useOpportunitySaved>;
