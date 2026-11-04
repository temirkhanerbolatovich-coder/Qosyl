'use client';
import { useI18n } from './locale-provider';
import {
  profileLinkLabels,
  profileLinkServices,
  profileLinkSchema,
  type ProfileLink,
} from '@/lib/profile-links';

export function ProfileLinksEditor({
  values,
  onChange,
}: {
  values: ProfileLink[];
  onChange: (values: ProfileLink[]) => void;
}) {
  const { locale, t } = useI18n();
  const update = (index: number, patch: Partial<ProfileLink>) =>
    onChange(values.map((value, at) => (at === index ? { ...value, ...patch } : value)));
  return (
    <section className="form-section stack" aria-labelledby="profile-links-heading">
      <h3 id="profile-links-heading">{t('Персональные ссылки', 'Жеке сілтемелер')}</h3>
      <p>
        {t(
          'До 6 необязательных ссылок. Каждая закрыта, пока вы не разрешите публикацию.',
          '6 міндетті емес сілтемеге дейін. Жариялауға рұқсат бергенше әр сілтеме жабық.',
        )}
      </p>
      {values.map((value, index) => (
        <fieldset className="panel form-grid" key={index}>
          <legend>
            {t('Ссылка', 'Сілтеме')} {index + 1}
          </legend>
          <label className="field">
            {t('Сервис', 'Сервис')}
            <select
              className="input"
              value={value.service}
              onChange={(event) =>
                update(index, { service: event.target.value as ProfileLink['service'] })
              }
            >
              {profileLinkServices.map((service) => (
                <option key={service} value={service}>
                  {profileLinkLabels[service][locale === 'kk' ? 1 : 0]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('Подпись (необязательно)', 'Атауы (міндетті емес)')}
            <input
              className="input"
              value={value.label}
              maxLength={80}
              onChange={(event) => update(index, { label: event.target.value })}
            />
          </label>
          <label className="field">
            HTTPS URL
            <input
              className="input"
              type="url"
              key={value.service}
              required
              maxLength={2000}
              value={value.url}
              onChange={(event) => {
                update(index, { url: event.target.value });
                event.target.setCustomValidity('');
              }}
              onBlur={(event) =>
                event.target.setCustomValidity(
                  profileLinkSchema.safeParse(value).success
                    ? ''
                    : t(
                        'Проверьте HTTPS-домен и выбранный сервис.',
                        'HTTPS доменін және таңдалған сервисті тексеріңіз.',
                      ),
                )
              }
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={value.isPublic}
              onChange={(event) => update(index, { isPublic: event.target.checked })}
            />
            {t('Разрешаю публикацию ссылки', 'Сілтемені жариялауға рұқсат беремін')}
          </label>
          <button
            className="button secondary"
            type="button"
            onClick={() => onChange(values.filter((_, at) => at !== index))}
          >
            {t('Удалить ссылку', 'Сілтемені жою')} {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        className="button secondary"
        type="button"
        disabled={values.length >= 6}
        onClick={() =>
          onChange([...values, { service: 'website', label: '', url: '', isPublic: false }])
        }
      >
        {t('Добавить ссылку', 'Сілтеме қосу')}
      </button>
    </section>
  );
}

export function PublicProfileLinks({ links }: { links: ProfileLink[] }) {
  const { locale, t } = useI18n();
  if (!links.length) return null;
  return (
    <section className="panel stack">
      <h2>{t('Ссылки', 'Сілтемелер')}</h2>
      {links.map((link, index) => (
        <a
          key={index}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ overflowWrap: 'anywhere' }}
        >
          {profileLinkLabels[link.service][locale === 'kk' ? 1 : 0]}
          {link.label && <span lang="und"> · {link.label}</span>}{' '}
          <span lang="und">({new URL(link.url).hostname})</span>
        </a>
      ))}
    </section>
  );
}
