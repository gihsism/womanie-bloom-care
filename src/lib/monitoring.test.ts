import { describe, it, expect, vi } from 'vitest';

const startSentry = vi.fn();
const captured = vi.fn();
vi.mock('./sentryClient', () => ({ startSentry, captureException: captured }));

// node environment: give the module the bits of `window` it touches.
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });

describe('lazy monitoring', () => {
  it('does nothing without a DSN', async () => {
    const m = await import('./monitoring');
    m.captureException(new Error('ignored'));
    m.initMonitoring(undefined, 'test');
    await new Promise((r) => setTimeout(r, 0));
    expect(startSentry).not.toHaveBeenCalled();
    expect(captured).not.toHaveBeenCalled();
  });

  it('holds errors raised before Sentry loads, then reports them', async () => {
    const m = await import('./monitoring');
    m.initMonitoring('https://k@o0.ingest.sentry.io/1', 'test');
    const early = new Error('early');
    m.captureException(early, { tags: { a: '1' } });
    await vi.waitFor(() => expect(startSentry).toHaveBeenCalledWith('https://k@o0.ingest.sentry.io/1', 'test'));
    expect(captured).toHaveBeenCalledWith(early, { tags: { a: '1' } });
    const late = new Error('late');
    m.captureException(late);
    expect(captured).toHaveBeenLastCalledWith(late, undefined);
  });
});
