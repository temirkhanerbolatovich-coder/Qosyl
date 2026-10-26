'use client';
import { opportunityCategoryLabels, specialtyLabels } from '@/lib/opportunity-search';
export function OpportunityFilters({ onSearch }: { onSearch: (query: string) => void }) {
  return (
    <form
      className="panel stack"
      aria-label="Поиск возможностей"
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
        Что ищете?
        <input name="q" maxLength={100} placeholder="Грант, стажировка, медицина, дизайн…" />
      </label>
      <div className="form-grid">
        <label className="field">
          Тип возможности
          <select name="category">
            <option value="">Все типы</option>
            {Object.entries(opportunityCategoryLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Направление
          <select name="specialty">
            <option value="">Все специальности</option>
            {Object.entries(specialtyLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Регион или онлайн
        <input name="geography" maxLength={120} placeholder="Только явно указанный регион" />
      </label>
      <p className="muted small-text">
        Направление определяется по словам в материале. Условия участия и неизвестные сроки
        проверяйте у организатора.
      </p>
      <button className="button secondary">Найти возможности</button>
    </form>
  );
}
