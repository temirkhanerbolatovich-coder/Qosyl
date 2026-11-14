'use client';
import { useId, useState } from 'react';
import {
  localizedOpportunityCategoryLabels,
  localizedOpportunityConditionLabels,
  localizedSpecialtyLabels,
} from '@/lib/localized-opportunity-labels';
import type { SavedOpportunityFilters } from '@/lib/opportunity-saved';
import type { OpportunityFacets } from '@/contracts/content-intake';
import { useI18n } from './locale-provider';
import { OpportunitySearchBox, rememberSearch } from './opportunity-search-box';
export function OpportunityFilters({
  onSearch,
  initialFilters,
  collapseOnMobile = false,
  facets,
  initialWindows,
}: {
  onSearch: (query: string) => void;
  initialFilters?: SavedOpportunityFilters;
  initialWindows?: { added?: string; deadline?: string; hours?: string; noExperience?: string };
  collapseOnMobile?: boolean;
  facets?: OpportunityFacets;
}) {
  const { locale, t } = useI18n();
  // Counts come from the last loaded search; they are not shown until that response arrives.
  const withCount = (label: string, count: number | undefined) =>
    count === undefined ? label : `${label} (${count})`;
  const opportunityCategoryLabels = localizedOpportunityCategoryLabels(locale);
  const specialtyLabels = localizedSpecialtyLabels(locale);
  const conditionLabels = localizedOpportunityConditionLabels(locale);
  const filtersId = useId();
  const [resets, setResets] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(
    () =>
      !collapseOnMobile &&
      Boolean(
        initialFilters?.category ||
        initialFilters?.specialty ||
        initialFilters?.geography ||
        initialFilters?.workMode ||
        initialFilters?.payStatus ||
        initialFilters?.kazakhstanEligible,
      ),
  );
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
        if (collapseOnMobile) setFiltersOpen(false);
        rememberSearch(params.get('q') ?? '');
        onSearch(params.toString());
      }}
    >
      <OpportunitySearchBox key={resets} defaultValue={resets ? '' : (initialFilters?.q ?? '')} />
      <button
        type="button"
        className="button secondary opportunity-filter-toggle"
        aria-expanded={filtersOpen}
        aria-controls={filtersId}
        onClick={() => setFiltersOpen((open) => !open)}
      >
        {filtersOpen ? t('Скрыть фильтры', 'Сүзгілерді жасыру') : t('Фильтры', 'Сүзгілер')}
      </button>
      <div id={filtersId} className="opportunity-filter-details" data-open={filtersOpen}>
        <div className="form-grid">
          <label className="field">
            {t('Тип возможности', 'Мүмкіндік түрі')}
            <select name="category" defaultValue={initialFilters?.category ?? ''}>
              <option value="">{t('Все типы', 'Барлық түрі')}</option>
              {Object.entries(opportunityCategoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {withCount(label, facets && (facets.category[key] ?? 0))}
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
        <div className="form-grid">
          <label className="field">
            {t('Формат', 'Формат')}
            <select name="workMode" defaultValue={initialFilters?.workMode ?? ''}>
              <option value="">{t('Любой формат', 'Кез келген формат')}</option>
              {Object.entries(conditionLabels.workMode).map(([key, label]) => (
                <option key={key} value={key}>
                  {withCount(label, facets && (facets.workMode[key] ?? 0))}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('Оплата', 'Төлем')}
            <select name="payStatus" defaultValue={initialFilters?.payStatus ?? ''}>
              <option value="">{t('Любая оплата', 'Кез келген төлем')}</option>
              {Object.entries(conditionLabels.payStatus).map(([key, label]) => (
                <option key={key} value={key}>
                  {withCount(label, facets && (facets.payStatus[key] ?? 0))}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('Участие из Казахстана', 'Қазақстаннан қатысу')}
            <select
              name="kazakhstanEligible"
              defaultValue={initialFilters?.kazakhstanEligible ?? ''}
            >
              <option value="">{t('Не важно', 'Маңызды емес')}</option>
              <option value="true">
                {withCount(t('Подтверждено', 'Расталған'), facets?.kazakhstanEligible)}
              </option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            {t('Когда добавлено', 'Қашан қосылған')}
            <select name="added" defaultValue={initialWindows?.added ?? ''}>
              <option value="">{t('За всё время', 'Барлық уақыт')}</option>
              <option value="7">{t('За 7 дней', 'Соңғы 7 күн')}</option>
              <option value="30">{t('За 30 дней', 'Соңғы 30 күн')}</option>
            </select>
          </label>
          <label className="field">
            {t('Срок подачи', 'Өтінім мерзімі')}
            <select name="deadline" defaultValue={initialWindows?.deadline ?? ''}>
              <option value="">{t('Любой', 'Кез келген')}</option>
              <option value="7">{t('До 7 дней', '7 күнге дейін')}</option>
              <option value="30">{t('До 30 дней', '30 күнге дейін')}</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            {t('Нагрузка в неделю', 'Аптасына жүктеме')}
            <select name="hours" defaultValue={initialWindows?.hours ?? ''}>
              <option value="">{t('Любая', 'Кез келген')}</option>
              <option value="10">{t('До 10 часов', '10 сағатқа дейін')}</option>
              <option value="20">{t('До 20 часов', '20 сағатқа дейін')}</option>
              <option value="30">{t('До 30 часов', '30 сағатқа дейін')}</option>
            </select>
          </label>
          <label className="field">
            {t('Опыт', 'Тәжірибе')}
            <select name="noExperience" defaultValue={initialWindows?.noExperience ?? ''}>
              <option value="">{t('Не важно', 'Маңызды емес')}</option>
              <option value="true">{t('Опыт не требуется', 'Тәжірибе қажет емес')}</option>
            </select>
          </label>
        </div>
        <p className="muted small-text">
          {t(
            'Нагрузка и опыт показываются только там, где редактор подтвердил значение; остальное уточняйте у организатора.',
            'Жүктеме мен тәжірибе тек редактор растаған жерде көрсетіледі; қалғанын ұйымдастырушыдан нақтылаңыз.',
          )}
        </p>
        <p className="muted small-text">
          {t(
            'Срез по сроку подачи показывает только возможности с подтверждённой датой; сроки на сайте организатора уточняйте. Срезы по времени не входят в сохранённый поиск.',
            'Өтінім мерзімі бойынша тек расталған күні бар мүмкіндіктер көрсетіледі; ұйымдастырушы сайтындағы мерзімді нақтылаңыз. Уақыт бойынша сүзгілер сақталған іздеуге кірмейді.',
          )}
        </p>
        <p className="muted small-text">
          {t(
            'Направление определяется по словам в материале. Условия участия и неизвестные сроки проверяйте у организатора.',
            'Бағыт материалдағы сөздер бойынша анықталады. Қатысу шарттары мен белгісіз мерзімдерді ұйымдастырушыдан нақтылаңыз.',
          )}
        </p>
      </div>
      <div className="button-row">
        <button className="button" type="submit">
          {t('Найти возможности', 'Мүмкіндіктерді табу')}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form)
              for (const element of form.elements) {
                if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement)
                  element.value = '';
              }
            setResets((count) => count + 1);
            if (collapseOnMobile) setFiltersOpen(false);
            onSearch('');
          }}
        >
          {t('Сбросить', 'Тазалау')}
        </button>
      </div>
    </form>
  );
}
