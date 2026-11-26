import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/account-data', () => ({ pushAccountData: vi.fn(), useAccountDataVersion: () => 0 }));

import HospitalBagChecklist from './HospitalBagChecklist';

beforeEach(() => localStorage.clear());

describe('HospitalBagChecklist', () => {
  // QA 2026-11-26 (round 4): packed was shown only as a strike-through, so a
  // screen reader could not tell which items were already in the bag.
  it('each item is a toggle button that announces whether it is packed', () => {
    render(<HospitalBagChecklist weeksPregnant={34} />);
    const item = screen.getByRole('button', { name: /Krankenkassenkarte/ });
    expect(item).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(item);
    expect(screen.getByRole('button', { name: /Krankenkassenkarte/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
