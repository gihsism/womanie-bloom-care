import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

const auth = { user: { id: 'u1' } };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/account-data', () => ({ pushAccountData: vi.fn(), useAccountDataVersion: () => 0 }));
let labs: Array<{ title: string; date_recorded: string }> = [];
vi.mock('@/integrations/db/client', () => ({
  db: { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: labs, error: null }) }) }) }) },
}));

import PregnancyCheckupsCard from './PregnancyCheckupsCard';

// Due 12 Mar 2027, today 27 Nov 2026 -> week 25.
const DUE = new Date(2027, 2, 12);

describe('PregnancyCheckupsCard', () => {
  beforeEach(() => {
    localStorage.clear();
    labs = [];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 27, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('lists the library-backed steps with their source, and the ask-your-midwife line', async () => {
    render(<PregnancyCheckupsCard dueDate={DUE} />);
    await act(async () => {});
    expect(screen.getByText('Week 25 · 0 of 6 marked done')).toBeInTheDocument();
    expect(screen.getByText('Weeks 11 to 13+6')).toBeInTheDocument();
    expect(screen.getAllByRole('link').map(a => a.getAttribute('href'))).toContain('https://pubmed.ncbi.nlm.nih.gov/39353600/');
    expect(screen.getByText(/^How many check-ups you have.*ask your midwife or doctor\.$/)).toBeInTheDocument();
    const glucose = screen.getByText('Test for gestational diabetes').closest('li')!;
    expect(within(glucose).getByText('Around now')).toBeInTheDocument();
  });

  it('marks a step done, saves it, and can undo', async () => {
    render(<PregnancyCheckupsCard dueDate={DUE} />);
    await act(async () => {});
    const scan = screen.getByText('Mid-pregnancy scan').closest('li')!;
    fireEvent.click(within(scan).getByRole('button', { name: /Mark done/ }));
    expect(within(scan).getByText('Done 27 Nov 2026')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('womanie_preg_checkups_u1')!)).toEqual({ 'mid-pregnancy-scan': { doneDate: '2026-11-27' } });
    fireEvent.click(within(scan).getByRole('button', { name: 'Undo' }));
    expect(within(scan).getByRole('button', { name: /Mark done/ })).toBeInTheDocument();
  });

  it('counts a glucose test result in her records as done', async () => {
    labs = [{ title: 'OGTT 75 g', date_recorded: '2026-11-10' }];
    render(<PregnancyCheckupsCard dueDate={DUE} />);
    await act(async () => {});
    expect(screen.getByText('Result in your records, 10 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('Week 25 · 1 of 6 marked done')).toBeInTheDocument();
  });

  it('renders nothing without a due date', () => {
    const { container } = render(<PregnancyCheckupsCard dueDate={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
