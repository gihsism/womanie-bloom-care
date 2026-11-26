import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/db/client', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'order']) chain[k] = () => chain;
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return { db: { from: () => chain } };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useLifeEvents', () => ({ useLifeEvents: () => ({ events: [], error: null, add: vi.fn(), remove: vi.fn() }) }));
vi.mock('@/components/research/EvidenceNote', () => ({ default: () => null }));

import MedicineLog from './MedicineLog';

describe('MedicineLog add form', () => {
  // QA 2026-11-26: Cancel cleared the name and dose but kept the extra
  // reminder times, so the next "Add" opened with them still there.
  it('Cancel resets the reminder times to the single 08:00 default', async () => {
    render(<MedicineLog stage="pregnancy" />);
    fireEvent.click(await screen.findByRole('button', { name: /Add/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ time' }));
    expect(screen.getAllByLabelText(/Reminder time/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    const times = screen.getAllByLabelText(/Reminder time/) as HTMLInputElement[];
    expect(times.map(t => t.value)).toEqual(['08:00']);
  });
});
