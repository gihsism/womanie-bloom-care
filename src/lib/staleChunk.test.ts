import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isStaleChunkError, reloadOnceForStaleChunk } from './staleChunk';

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

  it('reloads once, then not again within a minute (no loop)', () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk(1_000_000, reload)).toBe(true);
    expect(reloadOnceForStaleChunk(1_030_000, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForStaleChunk(1_100_000, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
