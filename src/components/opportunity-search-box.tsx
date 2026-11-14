'use client';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  localizedOpportunityCategoryLabels,
  localizedSpecialtyLabels,
} from '@/lib/localized-opportunity-labels';
import { categorySearchTerms, matchesSearchTerm, specialtyTerms } from '@/lib/opportunity-search';
import { useI18n } from './locale-provider';

const storageKey = 'qosyl.recent-searches';
const maxRecent = 5;

type Suggestion = {
  id: string;
  kind: 'recent' | 'category' | 'specialty';
  value: string;
  label: string;
};

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, maxRecent)
      : [];
  } catch {
    return [];
  }
}
function writeRecent(items: string[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    // Private mode or blocked storage: the box still works without history.
  }
}
/** Remembers a submitted text query on this device only. */
export function rememberSearch(query: string) {
  const value = query.trim();
  if (value.length < 2) return;
  writeRecent(
    [value, ...readRecent().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(
      0,
      maxRecent,
    ),
  );
}

export function OpportunitySearchBox({ defaultValue }: { defaultValue: string }) {
  const { locale, t } = useI18n();
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const categoryLabels = localizedOpportunityCategoryLabels(locale);
  const specialtyLabels = localizedSpecialtyLabels(locale);

  const typed = value.trim();
  const suggestions: Suggestion[] = [];
  if (!typed) {
    for (const item of recent)
      suggestions.push({ id: item, kind: 'recent', value: item, label: item });
  } else if (typed.length >= 2) {
    for (const [key, terms] of Object.entries(categorySearchTerms))
      if (terms.some((term) => matchesSearchTerm(typed, term)))
        suggestions.push({
          id: `category-${key}`,
          kind: 'category',
          value: key,
          label: t(`Тип: ${categoryLabels[key]}`, `Түрі: ${categoryLabels[key]}`),
        });
    for (const [key, terms] of Object.entries(specialtyTerms))
      if (terms.some((term) => matchesSearchTerm(typed, term)))
        suggestions.push({
          id: `specialty-${key}`,
          kind: 'specialty',
          value: key,
          label: t(
            `Направление: ${specialtyLabels[key as keyof typeof specialtyLabels]}`,
            `Бағыт: ${specialtyLabels[key as keyof typeof specialtyLabels]}`,
          ),
        });
  }
  const shown = suggestions.slice(0, maxRecent);
  const expanded = open && shown.length > 0;

  function pick(suggestion: Suggestion) {
    const form = input.current?.form;
    if (!form || !input.current) return;
    const fields = form.elements as unknown as Record<string, HTMLInputElement | HTMLSelectElement>;
    if (suggestion.kind === 'recent') {
      setValue(suggestion.value);
    } else {
      // A type or direction replaces the typed words, so the search stays one clear condition.
      setValue('');
      fields[suggestion.kind].value = suggestion.value;
    }
    setOpen(false);
    setActive(-1);
    // Let React apply the new input value before the form reads it.
    window.setTimeout(() => form.requestSubmit(), 0);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && shown.length) {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Positions run from -1 (the typed text itself) to the last suggestion, and wrap around.
      const positions = shown.length + 1;
      setActive((current) => ((current + 1 + step + positions) % positions) - 1);
    } else if (event.key === 'Enter') {
      if (expanded && active >= 0) {
        event.preventDefault();
        pick(shown[active]);
      } else {
        setOpen(false);
      }
    }
  }

  return (
    <div
      ref={wrapper}
      className="search-box"
      onBlur={(event) => {
        if (!wrapper.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label className="field">
        {t('Что ищете?', 'Не іздейсіз?')}
        <input
          ref={input}
          name="q"
          maxLength={100}
          value={value}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? `${id}-${active}` : undefined}
          autoComplete="off"
          onChange={(event) => {
            setValue(event.target.value);
            setRecent(readRecent());
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            setRecent(readRecent());
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={t(
            'Грант, стажировка, медицина, дизайн…',
            'Грант, тағылымдама, медицина, дизайн…',
          )}
        />
      </label>
      {expanded && (
        <div className="search-suggestions" lang={locale}>
          <p className="small-text muted" id={`${id}-title`}>
            {typed ? t('Подсказки', 'Ұсыныстар') : t('Недавние запросы', 'Соңғы сұраулар')}
          </p>
          <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-title`}>
            {shown.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(suggestion)}
              >
                {suggestion.label}
              </li>
            ))}
          </ul>
          {!typed && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                writeRecent([]);
                setRecent([]);
                input.current?.focus();
              }}
            >
              {t('Очистить недавние запросы', 'Соңғы сұраулар тарихын тазалау')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
