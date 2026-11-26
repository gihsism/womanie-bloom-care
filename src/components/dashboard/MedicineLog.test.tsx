import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  lifeEvents: [] as Array<{ kind: string; data: unknown }>,
}));

vi.mock('@/integrations/db/client', () => ({
  db: {
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let pending: { kind: 'update'; values: Record<string, unknown> } | null = null;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.order = () => chain;
      chain.eq = (c: string, v: unknown) => { filters.push([c, v]); return chain; };
      chain.update = (values: Record<string, unknown>) => { pending = { kind: 'update', values }; return chain; };
      chain.insert = (values: Record<string, unknown>) => { h.inserts.push({ table, values }); return chain; };
      chain.then = (ok: (v: unknown) => unknown) => {
        if (pending) h.updates.push({ table, values: pending.values, filters });
        return Promise.resolve({ data: pending ? null : h.rows, error: null }).then(ok);
      };
      return chain;
    },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useLifeEvents', () => ({
  useLifeEvents: () => ({ events: [], error: null, add: vi.fn(), remove: vi.fn() }),
  insertLifeEvent: vi.fn(async (_u: string, kind: string, e: { data: unknown }) => { h.lifeEvents.push({ kind, data: e.data }); return null; }),
}));
vi.mock('@/components/research/EvidenceNote', () => ({ default: () => null }));

import MedicineLog from './MedicineLog';

beforeEach(() => {
  h.rows = [];
  h.updates = [];
  h.inserts = [];
  h.lifeEvents = [];
});

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

describe('MedicineLog edit', () => {
  const IRON = { id: 'med-1', name: 'Iron', dose: '100 mg', times_per_day: 1, reminder_times: ['08:00'], stage: 'pregnancy', notes: null, active: true };

  it('edits name, dose and reminder times in place (same row), and records the change in history', async () => {
    h.rows = [IRON];
    render(<MedicineLog stage="pregnancy" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Iron' }));
    const nameBox = screen.getByLabelText('Name') as HTMLInputElement;
    expect(nameBox.value).toBe('Iron');
    expect((screen.getByLabelText('Dose (optional)') as HTMLInputElement).value).toBe('100 mg');
    fireEvent.change(nameBox, { target: { value: 'Iron bisglycinate' } });
    fireEvent.change(screen.getByLabelText('Dose (optional)'), { target: { value: '50 mg' } });
    fireEvent.change(screen.getByLabelText('Reminder time 1'), { target: { value: '20:00' } });
    fireEvent.click(screen.getByRole('button', { name: '+ time' })); // adds 20:00 again: de-duplicated
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(h.updates).toHaveLength(1));
    const u = h.updates[0];
    expect(u.table).toBe('medications');
    expect(u.values).toMatchObject({ name: 'Iron bisglycinate', dose: '50 mg', reminder_times: ['20:00'], times_per_day: 1 });
    expect(u.filters).toEqual([['id', 'med-1'], ['user_id', 'u1']]);
    expect(h.inserts.filter(i => i.table === 'medications')).toHaveLength(0); // never a new row
    expect(h.lifeEvents).toEqual([{
      kind: 'med_change',
      data: {
        medication_id: 'med-1',
        before: { name: 'Iron', dose: '100 mg', reminder_times: ['08:00'] },
        after: { name: 'Iron bisglycinate', dose: '50 mg', reminder_times: ['20:00'] },
      },
    }]);
    expect(await screen.findByText('Iron bisglycinate')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).toBeNull(); // form closed
  });

  it('Cancel leaves the medicine unchanged', async () => {
    h.rows = [IRON];
    render(<MedicineLog stage="pregnancy" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Iron' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Something else' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.updates).toHaveLength(0);
    expect(screen.getByText('Iron')).toBeInTheDocument();
  });
});
