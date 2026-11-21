// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hardReload, isStaleChunkError, reloadOnceForStaleChunk } from './staleChunk';

describe('stale chunk after a deploy', () => {
  beforeEach(() => sessionStorage.clear());

  it('recognises the browsers\' missing-chunk errors', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://womanie.info/assets/PatientDashboard-abc.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isStaleChunkError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });

  it("recognises Safari's crash when a lazy page resolved to nothing", () => {
    expect(isStaleChunkError(new TypeError("undefined is not an object (evaluating 'e._result.default')"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(true);
  });

  it('hard reload drops the service worker and its caches before reloading', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const del = vi.fn().mockResolvedValue(true);
    const reload = vi.fn();
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['workbox-precache-v2']), delete: del });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) } });
    const loc = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...loc, reload } });
    await hardReload();
    expect(unregister).toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith('workbox-precache-v2');
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'location', { configurable: true, value: loc });
    vi.unstubAllGlobals();
  });

  it('main.tsx never cancels the preload error (that makes React crash on Safari)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(process.cwd() + '/src/main.tsx', 'utf8');
    const handler = src.slice(src.indexOf('vite:preloadError'), src.indexOf('vite:preloadError') + 200);
    expect(handler).not.toMatch(/preventDefault\(\)/);
  });

  it('reloads once, then not again within a minute (no loop)', () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk(1_000_000, reload)).toBe(true);
    expect(reloadOnceForStaleChunk(1_030_000, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForStaleChunk(1_100_000, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
