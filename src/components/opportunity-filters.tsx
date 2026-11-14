'use client';
import { useEffect, useId, useRef, useState } from 'react';
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
  const formRef = useRef<HTMLFormElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // How many results the unsent choices would give, so "Показать N" tells before it is pressed.
  const [draftCount, setDraftCount] = useState<number | null>(null);
  const countTimer = useRef<number | undefined>(undefined);
  const countRequest = useRef<AbortController | null>(null);
  function scheduleCount() {
    window.clearTimeout(countTimer.current);
    countTimer.current = window.setTimeout(async () => {
      const form = formRef.current;
      if (!form) return;
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form))
        if (String(value).trim()) params.set(key, String(value).trim());
      countRequest.current?.abort();
      const request = (countRequest.current = new AbortController());
      try {
        const response = await fetch(`/api/content/posts?limit=1&page=1&${params}`, {
          cache: 'no-store',
          signal: request.signal,
        });
        const body = await response.json();
        setDraftCount(
          response.ok && Number.isSafeInteger(body.data?.total) ? body.data.total : null,
        );
      } catch {
        // An aborted or failed count simply shows nothing; the search itself still works.
      }
    }, 350);
  }
  useEffect(
    () => () => {
      window.clearTimeout(countTimer.current);
      countRequest.current?.abort();
    },
    [],
  );
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
  // On a phone the open filters are a bottom sheet: a modal dialog with its own focus handling.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 800px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const sheetOpen = narrow && filtersOpen;
  function resetFilters() {
    const form = formRef.current;
    if (form)
      for (const element of form.elements) {
        if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement)
          element.value = '';
      }
    setResets((count) => count + 1);
    setDraftCount(null);
    if (collapseOnMobile || narrow) setFiltersOpen(false);
    onSearch('');
  }
  function closeSheet() {
    setFiltersOpen(false);
    toggleRef.current?.focus();
  }
  useEffect(() => {
    if (!sheetOpen) return;
    const sheet = sheetRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet?.querySelector<HTMLElement>('select, input, button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSheet();
      } else if (event.key === 'Tab' && sheet) {
        // Keep Tab inside the sheet while it is open.
        const items = [
          ...sheet.querySelectorAll<HTMLElement>('select, input, button, [href]'),
        ].filter((item) => !item.hasAttribute('disabled') && item.offsetParent !== null);
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [sheetOpen]);
  const activeCount = [
    initialFilters?.category,
    initialFilters?.specialty,
    initialFilters?.geography,
    initialFilters?.workMode,
    initialFilters?.payStatus,
    initialFilters?.kazakhstanEligible,
    initialWindows?.added,
    initialWindows?.deadline,
    initialWindows?.hours,
    initialWindows?.noExperience,
  ].filter(Boolean).length;
  const countNote =
    draftCount === null ? null : (
      <p className="muted small-text opportunity-count-note" role="status">
        {t(`Найдётся: ${draftCount}`, `Табылады: ${draftCount}`)}
      </p>
    );
  return (
    <form
      ref={formRef}
      lang={locale}
      className="panel stack"
      aria-label={t('Поиск возможностей', 'Мүмкіндіктерді іздеу')}
      onChange={scheduleCount}
      onSubmit={(event) => {
        event.preventDefault();
        setDraftCount(null);
        const fields = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        for (const [key, value] of fields)
          if (String(value).trim()) params.set(key, String(value).trim());
        if (collapseOnMobile || narrow) setFiltersOpen(false);
        rememberSearch(params.get('q') ?? '');
        onSearch(params.toString());
      }}
    >
      <OpportunitySearchBox key={resets} defaultValue={resets ? '' : (initialFilters?.q ?? '')} />
      <button
        ref={toggleRef}
        type="button"
        className="button secondary opportunity-filter-toggle"
        aria-expanded={filtersOpen}
        aria-controls={filtersId}
        onClick={() => setFiltersOpen((open) => !open)}
      >
        {filtersOpen ? t('Скрыть фильтры', 'Сүзгілерді жасыру') : t('Фильтры', 'Сүзгілер')}
        {activeCount > 0 && !filtersOpen ? ` · ${activeCount}` : ''}
      </button>
      {sheetOpen && (
        <div className="opportunity-sheet-backdrop" onClick={closeSheet} aria-hidden="true" />
      )}
      <div
        id={filtersId}
        ref={sheetRef}
        className="opportunity-filter-details"
        data-open={filtersOpen}
        role={sheetOpen ? 'dialog' : undefined}
        aria-modal={sheetOpen ? true : undefined}
        aria-label={sheetOpen ? t('Фильтры', 'Сүзгілер') : undefined}
      >
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
        <div className="opportunity-sheet-footer">
          {countNote}
          <div className="button-row">
            <button className="button" type="submit">
              {draftCount === null
                ? t('Показать', 'Көрсету')
                : t(`Показать ${draftCount}`, `${draftCount} көрсету`)}
            </button>
            <button className="button secondary" type="button" onClick={resetFilters}>
              {t('Сбросить', 'Тазалау')}
            </button>
          </div>
        </div>
      </div>
      {!sheetOpen && countNote}
      <div className="button-row opportunity-form-actions">
        <button className="button" type="submit">
          {t('Найти возможности', 'Мүмкіндіктерді табу')}
        </button>
        {/* Nothing is applied, so there is nothing to reset: the button appears with the first filter. */}
        {(activeCount > 0 || Boolean(initialFilters?.q)) && (
          <button className="button secondary" type="button" onClick={resetFilters}>
            {t('Сбросить', 'Тазалау')}
          </button>
        )}
      </div>
    </form>
  );
}
