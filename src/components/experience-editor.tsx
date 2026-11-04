'use client';
import { useI18n } from './locale-provider';
import {
  experienceKinds,
  experienceKindLabels,
  type StudentExperience,
} from '@/lib/profile-details';

export function ExperienceEditor({
  values,
  onChange,
}: {
  values: StudentExperience[];
  onChange: (values: StudentExperience[]) => void;
}) {
  const { locale, t } = useI18n();
  const update = (at: number, patch: Partial<StudentExperience>) =>
    onChange(values.map((value, index) => (index === at ? { ...value, ...patch } : value)));
  return (
    <section className="form-section stack" aria-labelledby="experience-heading">
      <h3 id="experience-heading">{t('Опыт и учебные проекты', 'Тәжірибе және оқу жобалары')}</h3>
      <p className="muted">
        {t(
          'До 5 записей. Описывайте собственный вклад без вымышленных результатов. Публикация каждой записи включается отдельно.',
          '5 жазбаға дейін. Өз үлесіңізді ойдан шығарылған нәтижелерсіз сипаттаңыз. Әр жазбаның жариялануы бөлек қосылады.',
        )}
      </p>
      {values.map((value, index) => (
        <fieldset className="panel form-grid" key={index}>
          <legend>
            {t('Опыт', 'Тәжірибе')} {index + 1}
          </legend>
          <label className="field">
            {t('Тип опыта', 'Тәжірибе түрі')}
            <select
              className="input"
              value={value.kind}
              onChange={(event) =>
                update(index, { kind: event.target.value as StudentExperience['kind'] })
              }
            >
              {experienceKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {experienceKindLabels[kind][locale === 'kk' ? 1 : 0]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('Организация или проект', 'Ұйым немесе жоба')}
            <input
              className="input"
              required
              maxLength={120}
              value={value.organisation}
              onChange={(event) => update(index, { organisation: event.target.value })}
            />
          </label>
          <label className="field">
            {t('Ваша роль', 'Сіздің рөліңіз')}
            <input
              className="input"
              required
              maxLength={120}
              value={value.role}
              onChange={(event) => update(index, { role: event.target.value })}
            />
          </label>
          <label className="field">
            {t('Занятость (необязательно)', 'Жұмыспен қамту (міндетті емес)')}
            <input
              className="input"
              maxLength={80}
              value={value.employment}
              onChange={(event) => update(index, { employment: event.target.value })}
            />
          </label>
          <div className="form-grid columns">
            <label className="field">
              {t('Начало', 'Басталуы')}
              <input
                className="input"
                type="month"
                required
                value={value.startMonth}
                onChange={(event) => update(index, { startMonth: event.target.value })}
              />
            </label>
            <label className="field">
              {t('Окончание (пусто — продолжается)', 'Аяқталуы (бос — жалғасуда)')}
              <input
                className="input"
                type="month"
                min={value.startMonth || undefined}
                value={value.endMonth}
                onChange={(event) => update(index, { endMonth: event.target.value })}
              />
            </label>
          </div>
          <label className="field">
            {t('Задачи и личный вклад', 'Міндеттер және жеке үлес')}
            <textarea
              className="input"
              rows={3}
              maxLength={500}
              value={value.tasks}
              onChange={(event) => update(index, { tasks: event.target.value })}
            />
          </label>
          <label className="field">
            {t('Результат (если известен)', 'Нәтиже (белгілі болса)')}
            <textarea
              className="input"
              rows={3}
              maxLength={500}
              value={value.results}
              onChange={(event) => update(index, { results: event.target.value })}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={value.isPublic}
              onChange={(event) => update(index, { isPublic: event.target.checked })}
            />
            {t(
              'Разрешаю показать эту запись в публичном профиле',
              'Бұл жазбаны ашық профильде көрсетуге рұқсат беремін',
            )}
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() => onChange(values.filter((_, at) => at !== index))}
          >
            {t('Удалить запись', 'Жазбаны жою')} {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={values.length >= 5}
        onClick={() =>
          onChange([
            ...values,
            {
              organisation: '',
              role: '',
              kind: 'academic',
              employment: '',
              startMonth: '',
              endMonth: '',
              tasks: '',
              results: '',
              isPublic: false,
            },
          ])
        }
      >
        {t('Добавить опыт', 'Тәжірибе қосу')}
      </button>
    </section>
  );
}
