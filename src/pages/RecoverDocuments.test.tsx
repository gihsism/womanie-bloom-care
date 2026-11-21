import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = { user: null as null | { id: string; email: string; isAdmin?: boolean }, loading: false };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import RecoverDocuments from './RecoverDocuments';

const renderPage = () => render(<MemoryRouter><RecoverDocuments /></MemoryRouter>);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('RecoverDocuments — admin-only maintenance tool', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('a normal user gets a calm message, no request and no spinner', () => {
    auth.user = { id: 'u1', email: 'me@example.com', isAdmin: false };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderPage();
    expect(screen.getByText('Nothing to recover here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to dashboard' })).toBeInTheDocument();
    expect(screen.queryByText(/Forbidden/)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('if the server refuses (403), the spinner stops and the calm message shows', async () => {
    auth.user = { id: 'u1', email: 'me@example.com', isAdmin: true };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Forbidden' }, 403));
    renderPage();
    await waitFor(() => expect(screen.getByText('Nothing to recover here')).toBeInTheDocument());
    expect(screen.queryByText(/Forbidden/)).toBeNull();
  });

  it('any other failure offers a retry instead of spinning forever', async () => {
    auth.user = { id: 'u1', email: 'me@example.com', isAdmin: true };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'boom' }, 500));
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument());
  });

  it('an admin still sees the overview', async () => {
    auth.user = { id: 'a1', email: 'admin@example.com', isAdmin: true };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      current_user: { id: 'a1', email: 'admin@example.com' },
      total_groups: 0,
      groups: [],
    }));
    renderPage();
    await waitFor(() => expect(screen.getByText('Recover Documents')).toBeInTheDocument());
  });
});
