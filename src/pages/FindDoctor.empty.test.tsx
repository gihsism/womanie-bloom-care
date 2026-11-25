import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/db/client', () => {
  // Chainable query stub: every call returns the chain; awaiting it gives no rows.
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gt', 'order', 'insert', 'update', 'delete']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return { db: { from: () => chain } };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));

import { DoctorsJoiningEmptyState } from './FindDoctor';

describe('Find a Doctor empty state (no verified doctors yet)', () => {
  it('is honest about why, and offers a share code and the visit summary print', () => {
    const onPrint = vi.fn();
    render(<DoctorsJoiningEmptyState onPrint={onPrint} />);
    expect(screen.getByText('Doctors are joining Womanie')).toBeInTheDocument();
    expect(screen.getByText(/share your records with your own doctor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share a code with my doctor/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Print a visit summary/ }));
    expect(onPrint).toHaveBeenCalled();
  });

  it('opens the share-with-doctor flow from the empty state', () => {
    render(<DoctorsJoiningEmptyState onPrint={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Share a code with my doctor/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Share your records with a doctor')).toBeInTheDocument();
  });
});
