'use client';
import { useI18n } from './locale-provider';
import {
  profileVisibilityFields,
  profileVisibilityLabels,
  type ProfileVisibilityField,
} from '@/lib/profile-visibility';

export function ProfileVisibility({
  hidden,
  onChange,
}: {
  hidden: ProfileVisibilityField[];
  onChange: (fields: ProfileVisibilityField[]) => void;
}) {
  const { locale, t } = useI18n();
  return (
    <fieldset className="form-section stack">
      <legend>{t('Видимость полей профиля', 'Профиль өрістерінің көрінуі')}</legend>
      <p className="muted">
        {t(
          'Отмеченные поля видны в публичном профиле и заказчику в откликах. Скрытие не удаляет данные. Ссылки и опыт имеют отдельные разрешения.',
          'Белгіленген өрістер ашық профильде және өтінімде тапсырыс берушіге көрінеді. Жасыру деректерді жоймайды. Сілтемелер мен тәжірибе бөлек рұқсатпен жарияланады.',
        )}
      </p>
      {profileVisibilityFields.map((field) => (
        <label className="check-row" key={field}>
          <input
            type="checkbox"
            checked={!hidden.includes(field)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? hidden.filter((value) => value !== field)
                  : [...hidden, field],
              )
            }
          />
          {profileVisibilityLabels[field][locale === 'kk' ? 1 : 0]}
        </label>
      ))}
    </fieldset>
  );
}
