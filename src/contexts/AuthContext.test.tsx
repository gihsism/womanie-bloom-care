import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const sync = vi.fn().mockResolvedValue({ ok: true, copiedUp: [], refreshed: [], pushed: [] });
vi.mock('@/lib/account-data', () => ({ syncAccountData: (id: string) => sync(id) }));

import { AuthProvider, useAuth } from './AuthContext';

let ctx: ReturnType<typeof useAuth>;
function Probe() {
  ctx = useAuth();
  return <p>{ctx.loading ? 'loading' : ctx.user ? `user:${ctx.user.consentRequired ? 'gated' : 'ok'}` : 'none'}</p>;
}

const meReturns = (user: Record<string, unknown>) => {
  globalThis.fetch = vi.fn().mockResolvedValue({ json: async () => ({ user }) }) as unknown as typeof fetch;
};

describe('AuthProvider: account sync vs privacy consent', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { sync.mockClear(); });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('syncs device data into the account when consent is on file', async () => {
    meReturns({ id: 'u1', email: 'a@b.c', consentRequired: false });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('user:ok')).toBeTruthy());
    expect(sync).toHaveBeenCalledWith('u1');
  });

  it('holds the sync back while the consent screen is up, and runs it once she accepts', async () => {
    meReturns({ id: 'u2', email: 'a@b.c', consentRequired: true, consentReason: 'new' });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('user:gated')).toBeTruthy());
    expect(sync).not.toHaveBeenCalled();
    act(() => { ctx.markConsentAccepted(); });
    await waitFor(() => expect(screen.getByText('user:ok')).toBeTruthy());
    expect(sync).toHaveBeenCalledWith('u2');
  });
});
