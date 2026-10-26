'use client';

import { useSyncExternalStore } from 'react';
import {
  parseThemePreference,
  resolveTheme,
  themeStorageKey,
  type ThemePreference,
} from '@/lib/theme';

const changedEvent = 'qosyl-theme-change';
function currentPreference() {
  return parseThemePreference(document.documentElement.dataset.themePreference);
}
function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolveTheme(preference, matchMedia('(prefers-color-scheme: dark)').matches);
}
function subscribe(notify: () => void) {
  const system = matchMedia('(prefers-color-scheme: dark)');
  const systemChanged = () => {
    applyTheme(currentPreference());
    notify();
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== themeStorageKey && event.key !== null) return;
    applyTheme(parseThemePreference(event.newValue));
    notify();
  };
  system.addEventListener('change', systemChanged);
  window.addEventListener('storage', storageChanged);
  window.addEventListener(changedEvent, notify);
  return () => {
    system.removeEventListener('change', systemChanged);
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener(changedEvent, notify);
  };
}

export function ThemeSwitch() {
  const preference = useSyncExternalStore(subscribe, currentPreference, () => 'system');
  function change(value: string) {
    const next = parseThemePreference(value);
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {
      // The selection still works for this document when browser storage is blocked.
    }
    applyTheme(next);
    window.dispatchEvent(new Event(changedEvent));
  }
  return (
    <label className="theme-switch">
      <span>Тема</span>
      <select
        aria-label="Тема оформления"
        value={preference}
        onChange={(event) => change(event.target.value)}
      >
        <option value="light">Светлая</option>
        <option value="dark">Тёмная</option>
        <option value="system">Система</option>
      </select>
    </label>
  );
}
