'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from './locale-provider';
import type { NotificationLanguage } from '@/lib/notification-language';

export function NotificationLanguageSettings() {
  const { t } = useI18n();
  const [language, setLanguage] = useState<NotificationLanguage>('ru');
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<
    'saved' | 'load-error' | 'save-error' | 'unauthenticated' | null
  >(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/notification-language', { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          if (!controller.signal.aborted) setStatus('unauthenticated');
          return;
        }
        if (!response.ok) throw new Error('read failed');
        const body = await response.json();
        if (body?.data?.language !== 'ru' && body?.data?.language !== 'kk')
          throw new Error('invalid response');
        setLanguage(body.data.language);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('load-error');
      });
    return () => controller.abort();
  }, []);
  async function save() {
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch('/api/notification-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 401) {
        setLoaded(false);
        setStatus('unauthenticated');
        return;
      }
      if (!response.ok) throw new Error('save failed');
      setStatus('saved');
    } catch {
      setStatus('save-error');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="stack">
      <label className="field">
        {t('Язык новых уведомлений', 'Жаңа хабарламалар тілі')}
        <select
          value={language}
          disabled={!loaded || pending}
          onChange={(event) => {
            setLanguage(event.target.value as NotificationLanguage);
            setStatus(null);
          }}
        >
          <option value="ru" lang="ru">
            Русский
          </option>
          <option value="kk" lang="kk">
            Қазақша
          </option>
        </select>
      </label>
      <p className="muted small-text">
        {t(
          'Применяется к новым уведомлениям в этом аккаунте. Старые сообщения и язык интерфейса не меняются.',
          'Осы аккаунттағы жаңа хабарламаларға қолданылады. Бұрынғы хабарламалар мен интерфейс тілі өзгермейді.',
        )}
      </p>
      <button
        type="button"
        className="button secondary small"
        disabled={!loaded || pending}
        onClick={save}
      >
        {pending
          ? t('Сохраняем…', 'Сақталуда…')
          : t('Сохранить язык уведомлений', 'Хабарлама тілін сақтау')}
      </button>
      {status && (
        <div role={status === 'saved' ? 'status' : 'alert'}>
          {status === 'load-error' &&
            t(
              'Не удалось загрузить настройку. Обновите страницу и попробуйте снова.',
              'Параметрді жүктеу мүмкін болмады. Бетті жаңартып, қайталап көріңіз.',
            )}
          {status === 'save-error' &&
            t(
              'Сохранение не подтверждено. Обновите страницу и проверьте настройку перед повторной попыткой.',
              'Сақтау расталмады. Қайта әрекеттенбес бұрын бетті жаңартып, параметрді тексеріңіз.',
            )}
          {status === 'unauthenticated' && (
            <>
              {t('Сессия завершилась. Войдите снова.', 'Сессия аяқталды. Қайта кіріңіз.')}{' '}
              <Link href="/auth/login" className="text-link">
                {t('Войти', 'Кіру')}
              </Link>
            </>
          )}
          {status === 'saved' && t('Язык уведомлений сохранён.', 'Хабарлама тілі сақталды.')}
        </div>
      )}
    </div>
  );
}
