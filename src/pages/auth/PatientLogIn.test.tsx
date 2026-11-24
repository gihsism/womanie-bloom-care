import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/lib/platform', () => ({ isNativeApp: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import PatientLogIn from './PatientLogIn';

const renderPage = () => render(<MemoryRouter><PatientLogIn /></MemoryRouter>);

describe('PatientLogIn — Google-only accounts', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('leads with Google when this device last used Google', () => {
    localStorage.setItem('womanie_last_method', 'google');
    localStorage.setItem('womanie_last_email', 'me@example.com');
    renderPage();
    expect(screen.getByText(/You signed in with Google last time/)).toBeInTheDocument();
    expect(screen.getByText('or use a password')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Continue with Google/ })).toHaveLength(1);
    expect(screen.getByLabelText('Password')).not.toHaveFocus();
  });

  it('turns the "uses Google sign-in" error into a Google button, not a red error', async () => {
    localStorage.setItem('womanie_last_email', 'me@example.com');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: 'This account uses Google sign-in. Click "Continue with Google" instead.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    ));
    renderPage();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'old-saved-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('signs in with Google'));
    expect(screen.getAllByRole('button', { name: /Continue with Google/ })).toHaveLength(1);
    expect(localStorage.getItem('womanie_last_method')).toBe('google');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
  });

  it('password users keep the normal layout', () => {
    renderPage();
    expect(screen.queryByText(/You signed in with Google last time/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /Continue with Google/ })).toHaveLength(1);
  });
});
