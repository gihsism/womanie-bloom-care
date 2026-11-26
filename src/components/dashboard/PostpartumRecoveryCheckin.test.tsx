import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
const push = vi.fn();
vi.mock('@/lib/account-data', () => ({
  pushAccountData: (...a: unknown[]) => push(...a),
  useAccountDataVersion: () => 0,
}));

import PostpartumRecoveryCheckin from './PostpartumRecoveryCheckin';

const birth = new Date(2026, 10, 1);
const now = new Date(2026, 10, 10); // week 2

const answerAllOk = () => {
  for (const label of ['Light, pink or brown', 'None or very little', 'Healing well', 'All fine', 'Broken, but I get enough rest', 'Mostly OK']) {
    fireEvent.click(screen.getByRole('button', { name: label }));
  }
};

describe('PostpartumRecoveryCheckin', () => {
  beforeEach(() => { localStorage.clear(); push.mockReset(); });

  it('shows the weekly form, saves once all six are answered, and syncs to the account', () => {
    render(<PostpartumRecoveryCheckin birthDate={birth} now={now} />);
    expect(screen.getByText('Week 2 of 12')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save this week' });
    expect(save).toBeDisabled();
    answerAllOk();
    fireEvent.click(save);
    expect(screen.getByText(/sounds like normal healing/)).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem('postpartum:u1:recovery-checkins')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].week).toBe(2);
    expect(push).toHaveBeenCalledWith('u1', 'postpartum:u1:recovery-checkins');
    expect(screen.getByTestId('recovery-trend')).toBeInTheDocument();
  });

  it('a red flag shows "call your doctor or 144 now" straight away and keeps it after saving', () => {
    render(<PostpartumRecoveryCheckin birthDate={birth} now={now} />);
    expect(screen.queryByTestId('recovery-urgent')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /painful, swollen/ }));
    expect(screen.getByTestId('recovery-urgent')).toHaveTextContent('Call your doctor or 144 now.');
    answerAllOk();
    fireEvent.click(screen.getByRole('button', { name: 'Save this week' }));
    expect(screen.getByTestId('recovery-urgent')).toHaveTextContent('144');
  });

  it('self-harm thoughts show the urgent message and the 143 helpline', () => {
    render(<PostpartumRecoveryCheckin birthDate={birth} now={now} />);
    fireEvent.click(screen.getByRole('button', { name: 'I have thoughts of harming myself' }));
    expect(screen.getByTestId('recovery-urgent')).toHaveTextContent(/143/);
  });

  it('links the EPDS mood check instead of repeating it', () => {
    render(<PostpartumRecoveryCheckin birthDate={birth} now={now} />);
    expect(screen.getByRole('button', { name: 'mood check (EPDS)' })).toBeInTheDocument();
  });

  it('hides after week 12', () => {
    const { container } = render(<PostpartumRecoveryCheckin birthDate={birth} now={new Date(2027, 1, 1)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
