import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const auth = { user: { id: 'u1', email: 'me@example.com', name: 'Lena', isAdmin: false } as Record<string, unknown> };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAttentionCount', () => ({ useAttentionCount: () => ({ total: 2 }) }));
vi.mock('@/lib/account-data', () => ({ pushAccountData: vi.fn(), useAccountDataVersion: () => 0 }));
vi.mock('@/components/dashboard/MedicineLog', () => ({ default: () => <div>medicine-log</div> }));
vi.mock('@/components/dashboard/ChartAccessLog', () => ({ default: () => <div>access-log</div> }));

const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
// The profile load; a test can swap in a promise it resolves itself.
const profileLoad = { next: null as Promise<unknown> | null };
vi.mock('@/integrations/db/client', () => ({
  db: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => profileLoad.next ?? Promise.resolve({ data: { life_stage: 'conception', full_name: 'Lena' }, error: null }) }) }),
      update,
    }),
  },
}));

import Settings from './Settings';

window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.hash}</div>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/settings" element={<Settings />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );

describe('Me (Settings as a list of rows)', () => {
  beforeEach(() => { update.mockClear(); auth.user.isAdmin = false; profileLoad.next = null; });

  it('opens on a short list, not the old stack of cards', async () => {
    renderAt('/dashboard/settings');
    expect(screen.getByRole('heading', { name: 'Me' })).toBeInTheDocument();
    expect(screen.getByTestId('me-list')).toBeInTheDocument();
    expect(screen.queryByText('Delete my account')).toBeNull();
    expect(screen.queryByLabelText('Date of birth')).toBeNull();
    // Plain stage label, read from the stored key
    await waitFor(() => expect(screen.getByTestId('me-row-life-stage')).toHaveTextContent('Trying to conceive'));
  });

  it('reaches every destination the old Home menu offered', () => {
    const targets: Array<[string, string]> = [
      ['me-row-profile', '/dashboard/settings#profile'],
      ['me-row-life-stage', '/dashboard/settings#life-stage'],
      ['me-row-medicines', '/dashboard/settings#medicines'],
      ['me-row-reminders', '/dashboard/settings#reminders'],
      ['me-row-attention', '/dashboard/notifications'],
      ['me-row-emergency', '/dashboard/emergency'],
      ['me-row-devices', '/dashboard/devices'],
      ['me-row-community', '/community'],
      ['me-row-privacy', '/dashboard/settings#privacy'],
      ['me-row-password', '/dashboard/settings#password'],
      ['me-row-help', '/dashboard/help'],
      ['me-row-about', '/about'],
    ];
    for (const [row, path] of targets) {
      const { unmount } = renderAt('/dashboard/settings');
      fireEvent.click(screen.getByTestId(row));
      expect(screen.getByTestId('where')).toHaveTextContent(path);
      unmount();
    }
  });

  it('has Log out at the bottom and the admin row only for admins', () => {
    const { unmount } = renderAt('/dashboard/settings');
    expect(screen.getByTestId('me-logout')).toHaveTextContent('Log out');
    expect(screen.queryByTestId('me-row-admin')).toBeNull();
    unmount();
    auth.user.isAdmin = true;
    renderAt('/dashboard/settings');
    fireEvent.click(screen.getByTestId('me-row-admin'));
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/doctors');
  });

  it('a deep link opens Life stage, and choosing a stage saves the stored key', async () => {
    renderAt('/dashboard/settings#life-stage');
    expect(screen.getByRole('heading', { name: 'Life stage' })).toBeInTheDocument();
    expect(screen.queryByTestId('me-list')).toBeNull();
    for (const label of ['Before first period', 'Period tracking', 'Birth control', 'After birth', 'After menopause']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText('Birth control'));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ life_stage: 'contraception' }));
  });

  it('one tap on a stage saves once, not once per handler', async () => {
    renderAt('/dashboard/settings#life-stage');
    // The label tap also clicks the radio (htmlFor) and bubbles to the card.
    fireEvent.click(screen.getByText('After birth'));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ life_stage: 'postpartum' }));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('a stage tapped while the profile is still loading is not undone by the late load', async () => {
    let finishLoad: (v: unknown) => void = () => {};
    profileLoad.next = new Promise((resolve) => { finishLoad = resolve; });
    renderAt('/dashboard/settings#life-stage');
    fireEvent.click(screen.getByLabelText('Pregnancy'));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ life_stage: 'pregnancy' }));
    finishLoad({ data: { life_stage: 'conception', full_name: 'Lena' }, error: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole('radio', { name: 'Pregnancy' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Trying to conceive' })).not.toBeChecked();
  });

  it('old section names still open the right sub-page', () => {
    renderAt('/dashboard/settings#notifications');
    expect(screen.getByRole('heading', { name: 'Reminders' })).toBeInTheDocument();
  });

  it('each sub-page shows only its own content', () => {
    const { unmount } = renderAt('/dashboard/settings#profile');
    expect(screen.getByLabelText('Date of birth')).toBeInTheDocument();
    expect(screen.queryByText('Delete my account')).toBeNull();
    unmount();
    renderAt('/dashboard/settings#privacy');
    expect(screen.getByText('Delete my account')).toBeInTheDocument();
    expect(screen.getByText('access-log')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Back to Me' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/dashboard\/settings$/);
  });

  it('Your profile lets her change her name (Home\'s "Add your name" leads here)', async () => {
    renderAt('/dashboard/settings#profile');
    const box = await screen.findByLabelText('Your name');
    await waitFor(() => expect(box).toHaveValue('Lena'));
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    fireEvent.change(box, { target: { value: '  Elena ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ full_name: 'Elena' }));
  });
});
