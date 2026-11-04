'use client';
import {
  localizedOpportunityCategoryLabels,
  localizedSpecialtyLabels,
} from '@/lib/localized-opportunity-labels';
import type { SavedOpportunityFilters } from '@/lib/opportunity-saved';
import { useI18n } from './locale-provider';
export function OpportunityFilters({
  onSearch,
  initialFilters,
}: {
  onSearch: (query: string) => void;
  initialFilters?: SavedOpportunityFilters;
}) {
  const { locale, t } = useI18n();
  const opportunityCategoryLabels = localizedOpportunityCategoryLabels(locale);
  const specialtyLabels = localizedSpecialtyLabels(locale);
  return (
    <form
      lang={locale}
      className="panel stack"
      aria-label={t('Поиск возможностей', 'Мүмкіндіктерді іздеу')}
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        for (const [key, value] of fields)
          if (String(value).trim()) params.set(key, String(value).trim());
        onSearch(params.toString());
      }}
    >
      <label className="field">
        {t('Что ищете?', 'Не іздейсіз?')}
        <input
          name="q"
          maxLength={100}
          defaultValue={initialFilters?.q ?? ''}
          placeholder={t(
            'Грант, стажировка, медицина, дизайн…',
            'Грант, тағылымдама, медицина, дизайн…',
          )}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          {t('Тип возможности', 'Мүмкіндік түрі')}
          <select name="category" defaultValue={initialFilters?.category ?? ''}>
            <option value="">{t('Все типы', 'Барлық түрі')}</option>
            {Object.entries(opportunityCategoryLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('Направление', 'Бағыт')}
          <select name="specialty" defaultValue={initialFilters?.specialty ?? ''}>
            <option value="">{t('Все специальности', 'Барлық мамандық')}</option>
            {Object.entries(specialtyLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        {t('Регион или онлайн', 'Өңір немесе онлайн')}
        <input
          name="geography"
          maxLength={120}
          defaultValue={initialFilters?.geography ?? ''}
          placeholder={t('Только явно указанный регион', 'Тек нақты көрсетілген өңір')}
        />
      </label>
      <p className="muted small-text">
        {t(
          'Направление определяется по словам в материале. Условия участия и неизвестные сроки проверяйте у организатора.',
          'Бағыт материалдағы сөздер бойынша анықталады. Қатысу шарттары мен белгісіз мерзімдерді ұйымдастырушыдан нақтылаңыз.',
        )}
      </p>
      <button className="button secondary">{t('Найти возможности', 'Мүмкіндіктерді табу')}</button>
    </form>
  );
}
