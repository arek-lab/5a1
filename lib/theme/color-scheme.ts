export type ColorSchemePreference = 'system' | 'light' | 'dark';

export const COLOR_SCHEME_STORAGE_KEY = 'color-scheme';

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(listener => listener());
}

export function subscribeToPreference(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

export function getPreferenceSnapshot(): ColorSchemePreference {
  const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function getPreferenceServerSnapshot(): ColorSchemePreference {
  return 'system';
}

export function resolveColorScheme(preference: ColorSchemePreference): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyColorScheme(preference: ColorSchemePreference): void {
  document.documentElement.setAttribute('data-color-scheme', resolveColorScheme(preference));
}

export function setPreference(next: ColorSchemePreference): void {
  if (next === 'system') {
    window.localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
  } else {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next);
  }
  applyColorScheme(next);
  notify();
}

/** Stringified for the blocking inline script in app/layout.tsx — keep in sync by hand, it can't import this module. */
export const COLOR_SCHEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${COLOR_SCHEME_STORAGE_KEY}');var r=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-color-scheme',r);}catch(e){}})();`;
