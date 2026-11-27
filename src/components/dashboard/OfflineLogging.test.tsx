import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Logging with no signal: today's log and a medicine tick are kept on the
// phone and she is told, instead of the entry vanishing.

const h = vi.hoisted(() => ({
  offline: true,
  upserts: [] as Array<{ table: string; row: unknown }>,
  meds: [{ id: 'med-1', name: 'Iron', dose: '100 mg', times_per_day: 2, reminder_times: [], active: true }],
  toasts: [] as Array<{ title: string; description?: string; variant?: string }>,
}));

vi.mock('@/integrations/db/client', () => ({
  db: {
    from: (table: string) => {
      let op: 'select' | 'upsert' = 'select';
      let row: unknown = null;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.upsert = (r: unknown) => { op = 'upsert'; row = r; return chain; };
      const result = () => {
        if (h.offline) return { data: null, error: new TypeError('Failed to fetch') };
        if (op === 'upsert') { h.upserts.push({ table, row }); return { data: [row], error: null }; }
        return { data: table === 'medications' ? h.meds : [], error: null };
      };
      chain.maybeSingle = () => Promise.resolve(result());
      chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok);
      return chain;
    },
  },
}));
const auth = vi.hoisted(() => ({ user: { id: 'u1' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: (t: { title: string }) => h.toasts.push(t) }) }));
// One stable object, like the real hook's state between renders.
const lifeEvents = vi.hoisted(() => ({
  userId: 'u1', loaded: true, events: [] as unknown[], error: null,
  reload: async () => {}, add: async () => null, remove: async () => true,
}));
vi.mock('@/hooks/useLifeEvents', () => ({
  useLifeEvents: () => lifeEvents,
  insertLifeEvent: vi.fn(async () => null),
}));
vi.mock('@/components/research/EvidenceNote', () => ({ default: () => null }));

import DailyLogging from './DailyLogging';
import MedicineLog from './MedicineLog';
import { readUpserts, queueUpsert } from '@/lib/pendingUpserts';
import { readQueue, pendingKey } from '@/lib/pendingEvents';
import { format } from 'date-fns';

beforeEach(() => {
  localStorage.clear();
  h.offline = true;
  h.upserts = [];
  h.toasts = [];
});

describe("today's log offline", () => {
  it('a save with no connection is kept on the phone and she is told', async () => {
    render(<DailyLogging selectedMode="menstrual-cycle" />);
    fireEvent.click(screen.getAllByRole('button', { pressed: false })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Save today's log/ }));
    await waitFor(() => expect(h.toasts.length).toBe(1));
    expect(h.toasts[0].title).toBe('Saved on this phone');
    expect(h.toasts[0].variant).toBeUndefined();
    const q = readUpserts(localStorage, 'u1');
    expect(q).toHaveLength(1);
    expect(q[0].table).toBe('daily_health_signals');
    expect((q[0].row as { mood: string[] }).mood).toHaveLength(1);
  });

  it('a server refusal is still shown as a failure, not queued', async () => {
    h.offline = false;
    const { db } = await import('@/integrations/db/client');
    const orig = db.from;
    (db as { from: unknown }).from = (t: string) => {
      const c = orig(t) as unknown as Record<string, unknown>;
      c.upsert = () => ({ then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { error: 'Invalid value in request.' } }).then(ok) });
      return c;
    };
    try {
      render(<DailyLogging selectedMode="menstrual-cycle" />);
      fireEvent.click(screen.getByRole('button', { name: /Save today's log/ }));
      await waitFor(() => expect(h.toasts.length).toBe(1));
      expect(h.toasts[0].variant).toBe('destructive');
      expect(readUpserts(localStorage, 'u1')).toHaveLength(0);
    } finally {
      (db as { from: unknown }).from = orig;
    }
  });

  it('reopening the log shows what was saved on the phone', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    queueUpsert(localStorage, 'u1', {
      key: `daily_health_signals:${today}`, table: 'daily_health_signals', onConflict: 'user_id,signal_date',
      row: { user_id: 'u1', signal_date: today, mood: null, symptoms: null, discharge: null, notes: 'Sleep: 7h. felt ok' },
    });
    render(<DailyLogging selectedMode="menstrual-cycle" />);
    await waitFor(() => expect((screen.getByDisplayValue('felt ok') as HTMLTextAreaElement).value).toBe('felt ok'));
  });
});

describe('medicine tick offline', () => {
  it('a "Taken" tap with no connection still counts today, is queued, and shows not synced', async () => {
    h.offline = false; // the list loads
    render(<MedicineLog stage="pregnancy" />);
    await screen.findByText('Iron');
    expect(screen.getByText(/0 of 2 today/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Taken/ }));
    await waitFor(() => expect(screen.getByText(/1 of 2 today/)).toBeTruthy());
    expect(readQueue(localStorage, pendingKey('u1', 'med_dose'))).toHaveLength(1);
    expect(screen.getByLabelText('Not synced yet')).toBeTruthy();
    // Undo removes the queued tick, not a server row.
    fireEvent.click(screen.getByRole('button', { name: 'Undo last' }));
    await waitFor(() => expect(screen.getByText(/0 of 2 today/)).toBeTruthy());
    expect(readQueue(localStorage, pendingKey('u1', 'med_dose'))).toHaveLength(0);
  });
});
