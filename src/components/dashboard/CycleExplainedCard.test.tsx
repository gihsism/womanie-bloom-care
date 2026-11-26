import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { format, subDays } from 'date-fns';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

const tables: Record<string, unknown[]> = {};
// A chainable query stub: every builder call returns itself, awaiting it
// resolves the rows for that table.
function query(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'limit']) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [] }).then(res);
  return q;
}
vi.mock('@/integrations/db/client', () => ({ db: { from: (t: string) => query(t) } }));

import CycleExplainedCard from './CycleExplainedCard';

const d = (n: number) => format(subDays(new Date(), n), 'yyyy-MM-dd');

beforeEach(() => { for (const k of Object.keys(tables)) delete tables[k]; });

describe('CycleExplainedCard', () => {
  it('renders nothing without logged periods', async () => {
    const { container } = render(<CycleExplainedCard />);
    await new Promise(r => setTimeout(r, 0));
    expect(container.textContent).toBe('');
  });

  it('shows averages, the confidence note and no doctor line for 2 normal cycles', async () => {
    tables.period_tracking = [
      { period_start_date: d(60), period_end_date: d(56) },
      { period_start_date: d(32), period_end_date: d(28) },
      { period_start_date: d(4), period_end_date: null },
    ];
    render(<CycleExplainedCard />);
    expect(await screen.findByText('Your cycle, explained')).toBeInTheDocument();
    expect(screen.getByText('28 days')).toBeInTheDocument();
    expect(screen.getByText('5 days')).toBeInTheDocument();
    expect(screen.getByText(/2 cycles so far/)).toBeInTheDocument();
    expect(screen.queryByTestId('cycle-doctor-line')).toBeNull();
  });

  it('shows the calm doctor line when no period has been logged for 90+ days', async () => {
    tables.period_tracking = [
      { period_start_date: d(150), period_end_date: d(146) },
      { period_start_date: d(122), period_end_date: d(118) },
      { period_start_date: d(94), period_end_date: d(90) },
    ];
    render(<CycleExplainedCard />);
    const line = await screen.findByTestId('cycle-doctor-line');
    expect(line.textContent).toMatch(/94 days ago/);
    expect(line.textContent).toMatch(/isn’t a diagnosis/);
  });

  it('no 90-day line after a recent birth (pregnancy break)', async () => {
    tables.period_tracking = [
      { period_start_date: d(400), period_end_date: d(396) },
      { period_start_date: d(372), period_end_date: d(368) },
    ];
    tables.babies = [{ birth_date: d(30) }];
    render(<CycleExplainedCard />);
    await screen.findByText('Your cycle, explained');
    expect(screen.queryByTestId('cycle-doctor-line')).toBeNull();
  });
});
