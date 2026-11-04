'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from './locale-provider';
import { avatarResponse } from '@/contracts/avatar';
import { AVATAR_ACCEPT, MAX_AVATAR_BYTES, avatarUrl, type AvatarMetadata } from '@/lib/avatar';

export function ProfileAvatarImage({ name, url }: { name: string; url?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  return url && failedUrl !== url ? (
    // Direct authenticated no-store endpoint; Next image optimization must not cache private bytes.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      width={96}
      height={96}
      style={{ objectFit: 'cover', borderRadius: '50%' }}
      onError={() => setFailedUrl(url)}
    />
  ) : (
    <span className="avatar" aria-label={name}>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}

export function ProfileAvatarEditor({ userId, name }: { userId: string; name: string }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<AvatarMetadata | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/profile/avatar', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
    })
      .then(async (response) => {
        if (!response.ok) {
          setError(response.status);
          return;
        }
        const result = avatarResponse.parse(await response.json());
        if (!controller.signal.aborted) setAvatar(result.data.avatar);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(503);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  async function mutate(method: 'POST' | 'PATCH' | 'DELETE') {
    if (busy) return;
    if (
      method === 'POST' &&
      (!file || file.size > MAX_AVATAR_BYTES || !['image/jpeg', 'image/png'].includes(file.type))
    ) {
      setError(file && file.size > MAX_AVATAR_BYTES ? 413 : 415);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/profile/avatar', {
        method,
        signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': method === 'POST' ? file!.type : 'application/json' },
        body:
          method === 'POST'
            ? file
            : JSON.stringify({
                revision: avatar?.revision,
                ...(method === 'PATCH' ? { isPublic: !avatar?.isPublic } : {}),
              }),
      });
      if (!response.ok) {
        setError(response.status);
        return;
      }
      setAvatar(avatarResponse.parse(await response.json()).data.avatar);
      setSaved(true);
      if (method === 'POST' || method === 'DELETE') {
        setFile(null);
        if (input.current) input.current.value = '';
      }
    } catch {
      setError(503);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack" aria-labelledby="avatar-heading" aria-busy={busy || loading}>
      <h2 id="avatar-heading">{t('Фотография профиля', 'Профиль фотосуреті')}</h2>
      <p className="muted">
        {t(
          'Необязательно. JPEG или PNG до 2 МиБ и 16 мегапикселей. Новая фотография приватная; публикация разрешается отдельно. Фото не влияет на отклики.',
          'Міндетті емес. JPEG немесе PNG, 2 МиБ және 16 мегапиксельге дейін. Жаңа фото жабық; жариялау бөлек рұқсатпен. Фото өтінімдерге әсер етпейді.',
        )}
      </p>
      <ProfileAvatarImage
        name={name}
        url={avatar ? avatarUrl(userId, avatar.revision) : undefined}
      />
      {loading && <p role="status">{t('Загружаем…', 'Жүктелуде…')}</p>}
      {error && (
        <div className="alert error" role="alert">
          {error === 413
            ? t('Файл слишком большой. Максимум 2 МиБ.', 'Файл тым үлкен. Ең көбі 2 МиБ.')
            : error === 415 || error === 400
              ? t(
                  'Выберите корректное статичное изображение JPEG или PNG до 16 мегапикселей.',
                  '16 мегапиксельге дейінгі дұрыс статикалық JPEG немесе PNG таңдаңыз.',
                )
              : error === 409
                ? t(
                    'Аватар изменился. Обновите состояние и повторите действие.',
                    'Аватар өзгерді. Күйді жаңартып, әрекетті қайталаңыз.',
                  )
                : error === 429
                  ? t(
                      'Слишком много действий. Подождите минуту.',
                      'Әрекет тым көп. Бір минут күтіңіз.',
                    )
                  : t(
                      'Не удалось выполнить действие. Проверьте соединение и доступ к аккаунту.',
                      'Әрекет орындалмады. Байланыс пен аккаунтқа қолжетімділікті тексеріңіз.',
                    )}
          <button
            className="button secondary"
            type="button"
            disabled={busy || loading}
            onClick={() => {
              setLoading(true);
              setError(null);
              setRetry((value) => value + 1);
            }}
          >
            {t('Обновить состояние', 'Күйді жаңарту')}
          </button>
        </div>
      )}
      {saved && (
        <p role="status">{t('Изменение фотографии сохранено.', 'Фотосурет өзгерісі сақталды.')}</p>
      )}
      <label className="field">
        {t('Файл аватара', 'Аватар файлы')}
        <input
          ref={input}
          className="input"
          type="file"
          accept={AVATAR_ACCEPT}
          disabled={busy || loading}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
            setSaved(false);
          }}
        />
      </label>
      <div className="inline-actions">
        <button
          className="button"
          type="button"
          disabled={busy || loading || !file}
          onClick={() => mutate('POST')}
        >
          {busy ? t('Сохраняем…', 'Сақталуда…') : t('Загрузить фотографию', 'Фотосуретті жүктеу')}
        </button>
        {avatar && (
          <>
            <button
              className="button secondary"
              type="button"
              disabled={busy || loading}
              onClick={() => mutate('PATCH')}
            >
              {avatar.isPublic
                ? t('Скрыть фотографию', 'Фотосуретті жасыру')
                : t('Разрешить публикацию фотографии', 'Фотосуретті жариялауға рұқсат беру')}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy || loading}
              onClick={() => mutate('DELETE')}
            >
              {t('Удалить фотографию', 'Фотосуретті жою')}
            </button>
          </>
        )}
      </div>
      {avatar && (
        <p className="muted">
          {avatar.isPublic
            ? t('Фотография видна при публичном профиле.', 'Фотосурет ашық профильде көрінеді.')
            : t('Фотография доступна только вам.', 'Фотосурет тек сізге қолжетімді.')}
        </p>
      )}
    </section>
  );
}
