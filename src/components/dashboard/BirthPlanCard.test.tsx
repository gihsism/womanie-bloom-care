import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
const upsert = vi.fn(async (_row: unknown, _opts?: unknown) => ({ error: null }));
vi.mock('@/integrations/db/client', () => ({
  db: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: (row: unknown, opts: unknown) => upsert(row, opts),
    }),
  },
}));

import BirthPlanCard from './BirthPlanCard';

const savedNotes = () => upsert.mock.calls.map(c => JSON.parse((c[0] as { plan: string }).plan).notes);

describe('BirthPlanCard', () => {
  beforeEach(() => { localStorage.clear(); upsert.mockClear(); navigate.mockReset(); });

  it('a note typed just before "Print or save PDF" is saved to the account before the print page opens', async () => {
    render(<BirthPlanCard />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /Pain relief/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Pain relief: your own words' }), { target: { value: 'Warm water first' } });
    expect(upsert).not.toHaveBeenCalled(); // still inside the debounce
    fireEvent.click(screen.getByRole('button', { name: /Print or save PDF/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard/birth-plan/print'));
    expect(savedNotes().at(-1)).toEqual({ pain: 'Warm water first' });
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);
  });

  it('a change still waiting for its debounce is saved when the card unmounts', async () => {
    const { unmount } = render(<BirthPlanCard />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /Feeding/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Feeding: your own words' }), { target: { value: 'Skin to skin' } });
    unmount();
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(savedNotes()[0]).toEqual({ feeding: 'Skin to skin' });
  });
});
