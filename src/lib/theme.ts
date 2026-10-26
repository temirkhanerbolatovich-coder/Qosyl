export type ThemePreference = 'light' | 'dark' | 'system';
export const themeStorageKey = 'qosyl-theme';

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean) {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

// Static, early head script: storage is untrusted and may be unavailable.
// Keep validation equivalent to parseThemePreference; tests exercise this script before hydration.
export const themeBootstrap = `(()=>{let p='system';try{const v=localStorage.getItem('qosyl-theme');if(v==='light'||v==='dark')p=v}catch{}const d=document.documentElement;d.dataset.themePreference=p;d.dataset.theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p})()`;
