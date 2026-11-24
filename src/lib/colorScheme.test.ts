// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyColorScheme,
  COLOR_SCHEME_KEY,
  getColorSchemePref,
  resolveColorScheme,
  setColorSchemePref,
  THEME_COLOR,
} from './colorScheme';

function mockSystemDark(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: dark && q.includes('dark'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const meta = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

describe('night mode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF">';
  });
  afterEach(() => vi.restoreAllMocks());

  it('defaults to Automatic and follows the system setting', () => {
    expect(getColorSchemePref()).toBe('auto');
    mockSystemDark(true);
    expect(applyColorScheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(meta()?.content).toBe(THEME_COLOR.dark);
    mockSystemDark(false);
    expect(applyColorScheme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(meta()?.content).toBe(THEME_COLOR.light);
  });

  it('a manual choice wins over the system and is stored on the device', () => {
    mockSystemDark(true);
    setColorSchemePref('light');
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    mockSystemDark(false);
    setColorSchemePref('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    setColorSchemePref('auto');
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to Automatic when storage is blocked or holds junk', () => {
    localStorage.setItem(COLOR_SCHEME_KEY, 'purple');
    expect(getColorSchemePref()).toBe('auto');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getColorSchemePref()).toBe('auto');
    mockSystemDark(false);
    expect(() => setColorSchemePref('dark')).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(resolveColorScheme('light')).toBe('light');
  });
});
