import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = { user: null as null | { id: string; consentRequired?: boolean; consentReason?: 'new' | 'updated' | null }, markConsentAccepted: vi.fn() };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

import { ConsentGate } from './ConsentGate';
import { PRIVACY_POLICY_VERSION } from '@/lib/policyVersion';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsentGate><p>app content</p></ConsentGate>
    </MemoryRouter>,
  );

describe('ConsentGate', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { auth.markConsentAccepted.mockReset(); });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('shows the app when consent is already recorded', () => {
    auth.user = { id: 'u1', consentRequired: false };
    renderAt('/dashboard');
    expect(screen.getByText('app content')).toBeTruthy();
    expect(screen.queryByTestId('consent-gate')).toBeNull();
  });

  it('new account (Google sign-up / no row): blocks the app, the tick is required, records with version + gate', async () => {
    auth.user = { id: 'u1', consentRequired: true, consentReason: 'new' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderAt('/welcome');
    expect(screen.queryByText('app content')).toBeNull();
    expect(screen.getByTestId('consent-gate-policy-link').getAttribute('href')).toBe('/privacy');
    const cont = screen.getByTestId('consent-gate-continue') as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(cont.disabled).toBe(false);
    fireEvent.click(cont);
    await waitFor(() => expect(auth.markConsentAccepted).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/me/consents');
    expect(JSON.parse(String(init.body))).toEqual({ document: 'privacy_policy', version: PRIVACY_POLICY_VERSION, context: 'gate' });
  });

  it('version bump: explains that the policy changed', () => {
    auth.user = { id: 'u1', consentRequired: true, consentReason: 'updated' };
    renderAt('/dashboard');
    expect(screen.getByText(/privacy policy has changed/i)).toBeTruthy();
  });

  it('stays blocked and explains when saving fails', async () => {
    auth.user = { id: 'u1', consentRequired: true, consentReason: 'new' };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ code: 'policy_outdated' }) }) as unknown as typeof fetch;
    renderAt('/dashboard');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByTestId('consent-gate-continue'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/reload/i));
    expect(auth.markConsentAccepted).not.toHaveBeenCalled();
  });

  it('never covers the privacy policy page itself', () => {
    auth.user = { id: 'u1', consentRequired: true, consentReason: 'new' };
    renderAt('/dashboard/privacy');
    expect(screen.getByText('app content')).toBeTruthy();
  });
});
