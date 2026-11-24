// Night mode (2026-11-24). <html class="dark"> switches every colour token
// in src/index.css to its night value; components never pick colours
// themselves. The choice lives on this device only (Me -> Appearance):
//   'auto'  - follow the phone's light/dark setting (default)
//   'light' / 'dark' - always that.
// index.html runs the same logic inline before first paint, so a 3 am
// open never flashes white.

export type ColorSchemePref = 'auto' | 'light' | 'dark';

export const COLOR_SCHEME_KEY = 'womanie_color_scheme';

/** Browser / PWA chrome colour per mode (= --background). */
export const THEME_COLOR = { light: '#FFFFFF', dark: '#141012' } as const;

const PREFS: readonly ColorSchemePref[] = ['auto', 'light', 'dark'];

export function isColorSchemePref(v: unknown): v is ColorSchemePref {
  return typeof v === 'string' && (PREFS as readonly string[]).includes(v);
}

export function getColorSchemePref(): ColorSchemePref {
  try {
    const v = localStorage.getItem(COLOR_SCHEME_KEY);
    return isColorSchemePref(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function resolveColorScheme(pref: ColorSchemePref = getColorSchemePref()): 'light' | 'dark' {
  if (pref === 'auto') return systemPrefersDark() ? 'dark' : 'light';
  return pref;
}

/** Put the resolved mode on <html> and the theme-color meta. */
export function applyColorScheme(pref: ColorSchemePref = getColorSchemePref()): 'light' | 'dark' {
  const mode = resolveColorScheme(pref);
  if (typeof document === 'undefined') return mode;
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[mode];
  const status = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (status) status.content = mode === 'dark' ? 'black' : 'default';
  return mode;
}

/** Me -> Appearance: remember on this device (best effort) and apply now. */
export function setColorSchemePref(pref: ColorSchemePref): void {
  try {
    if (pref === 'auto') localStorage.removeItem(COLOR_SCHEME_KEY);
    else localStorage.setItem(COLOR_SCHEME_KEY, pref);
  } catch { /* storage blocked: still applies for this session */ }
  current = pref;
  applyColorScheme(pref);
  listeners.forEach((l) => l(pref));
}

let current: ColorSchemePref | null = null;
const listeners = new Set<(p: ColorSchemePref) => void>();

export function onColorSchemePrefChange(l: (p: ColorSchemePref) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** At start-up: apply, and follow the system setting while on Automatic. */
export function initColorScheme(): void {
  current = getColorSchemePref();
  applyColorScheme(current);
  try {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => { if ((current ?? getColorSchemePref()) === 'auto') applyColorScheme('auto'); };
    if (mq?.addEventListener) mq.addEventListener('change', onChange);
    else mq?.addListener?.(onChange);
  } catch { /* no matchMedia */ }
}
