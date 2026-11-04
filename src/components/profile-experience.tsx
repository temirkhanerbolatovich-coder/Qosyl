'use client';
import { useI18n } from './locale-provider';
import { experienceKindLabels, type StudentExperience } from '@/lib/profile-details';

/** The server must pass only explicitly published entries. */
export function ProfileExperience({
  items,
  studyYear,
  languages,
}: {
  items: StudentExperience[];
  studyYear: number | null;
  languages: string[];
}) {
  const { locale, t } = useI18n();
  if (!items.length && !studyYear && !languages.length) return null;
  return (
    <section className="panel stack" aria-labelledby="profile-experience-heading">
      <h2 id="profile-experience-heading">
        {t('Образование и самостоятельный опыт', 'Білім және жеке тәжірибе')}
      </h2>
      {studyYear && (
        <p>
          {t('Курс', 'Курс')}: {studyYear}
        </p>
      )}
      {!!languages.length && (
        <p>
          {t('Языки', 'Тілдер')}: <span lang="und">{languages.join(', ')}</span>
        </p>
      )}
      {items.map((item, index) => (
        <article key={index} className="form-section">
          <p className="badge">
            {experienceKindLabels[item.kind][locale === 'kk' ? 1 : 0]} ·{' '}
            {t('Добавлено пользователем', 'Пайдаланушы қосқан')}
          </p>
          <h3 lang="und">
            {item.organisation} · {item.role}
          </h3>
          <p>
            {item.startMonth} — {item.endMonth || t('по настоящее время', 'қазіргі уақытқа дейін')}
            {item.employment && <span lang="und"> · {item.employment}</span>}
          </p>
          {item.tasks && (
            <p lang="und" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {item.tasks}
            </p>
          )}
          {item.results && (
            <p lang="und" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {item.results}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
