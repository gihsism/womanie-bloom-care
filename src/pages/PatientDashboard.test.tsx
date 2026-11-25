import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { EMPTY_STATE } from '@/lib/quickLog/state';

// Renders Home (idea 4, round 6 "much more straightforward") with its data
// hooks stubbed: the stage header (chip that changes the stage, ONE big
// fact, one sentence), ONE primary action ("Log today", which opens the
// one-tap tiles in a sheet), Today (at most 3 rows, "Show all" for the
// rest) — and nothing else.

const state = vi.hoisted(() => ({
  mode: 'conception' as string,
  weeks: null as number | null,
  signals: {} as Record<string, unknown>,
  log: vi.fn(),
  undo: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('@/hooks/useStageProfile', () => ({
  useStageProfile: () => ({
    selectedMode: state.mode,
    profile: { full_name: 'Lena Muster' },
    periodData: { lastPeriodStart: new Date(), cycleLength: 28 },
    pregnancyDueDate: new Date(Date.now() + 100 * 86400000),
    ivfStartDate: new Date(),
    ivfPhase: 'stimulation',
    weeksPregnant: state.weeks,
    reloadPeriod: () => {},
  }),
}));
vi.mock('@/hooks/useTodaySignals', () => ({ useTodaySignals: () => state.signals }));
vi.mock('@/hooks/useQuickLog', () => ({
  useQuickLog: () => ({ state: EMPTY_STATE, meds: [], hasBaby: true, loaded: true, log: state.log, reload: () => {} }),
}));
vi.mock('@/hooks/useHeaderFacts', () => ({ useHeaderFacts: () => ({ stageName: 'Stage' }) }));
vi.mock('@/components/dashboard/LogSheet', () => ({
  default: ({ open }: { open: string | null }) => (open ? <div role="dialog">Log sheet: {open}</div> : null),
}));

import PatientDashboard from './PatientDashboard';

function renderHome(mode: LifeStage, weeks: number | null = null) {
  state.mode = mode;
  state.weeks = weeks;
  return render(
    <MemoryRouter>
      <PatientDashboard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.signals = {};
  state.undo = vi.fn().mockResolvedValue(undefined);
  state.log = vi.fn().mockResolvedValue({ title: 'Kick logged · 10:42', undo: state.undo });
});

const STAGES: LifeStage[] = ['pre-menstrual', 'menstrual-cycle', 'contraception', 'conception', 'ivf', 'pregnancy', 'postpartum', 'menopause', 'post-menopause'];

const openLog = () => fireEvent.click(screen.getByRole('button', { name: 'Log today' }));

describe('Home template (idea 4, round 6)', () => {
  it.each(STAGES)('%s: header with one fact, one action, Today — and nothing else', (mode) => {
    const { container } = renderHome(mode, 20);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /change life stage/i })).toHaveAttribute('href', '/dashboard/settings#life-stage');
    expect(container.querySelectorAll('header dd')).toHaveLength(0);
    // the one action; the tiles are not on Home until she taps it
    expect(screen.getAllByTestId('home-primary')).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Tap to log' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByTestId('today-empty')).toHaveTextContent('Nothing logged yet today');
    expect(screen.queryByRole('heading', { name: /^More for / })).toBeNull();
    expect(container.textContent).not.toMatch(/Good (morning|afternoon|evening)|\bMenu\b|Upload|Devices|Community|Daily Reminders|Quick Access/);
  });

  it('"Log today" opens the tiles, three per row', () => {
    renderHome('pregnancy', 30);
    openLog();
    const region = screen.getByRole('region', { name: 'Tap to log' });
    expect(region.querySelector('ul')!.className).toContain('grid-cols-3');
    const tiles = within(region).getAllByRole('listitem');
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(6);
  });

  it('shows at most three Today rows, the rest behind "Show all"', () => {
    state.signals = {
      appointmentToday: new Date(new Date().setHours(23, 0, 0, 0)),
      newDoctorNotes: 1,
      flaggedResults: 2,
      setup: { done: 1, total: 3 },
    };
    renderHome('menstrual-cycle');
    const today = screen.getByRole('heading', { name: 'Today' }).closest('section')!;
    expect(within(today).getAllByRole('listitem')).toHaveLength(3);
    expect(within(today).queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('pregnancy week 30: Log today → Kick logs at once and Undo deletes it', async () => {
    renderHome('pregnancy', 30);
    openLog();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Kick' })); });
    expect(state.log).toHaveBeenCalledWith(expect.objectContaining({ id: 'kick' }), undefined);
    expect(screen.getByRole('status')).toHaveTextContent('Kick logged · 10:42');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo' })); });
    expect(state.undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('"…" opens the details instead of logging; "Add more detail" opens the Log sheet', () => {
    renderHome('pregnancy', 30);
    openLog();
    fireEvent.click(screen.getByRole('button', { name: 'Nausea: details' }));
    expect(state.log).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Log sheet: log');
  });

  it('a two-choice tile asks first, then logs the choice', async () => {
    renderHome('menstrual-cycle');
    openLog();
    fireEvent.click(screen.getByRole('button', { name: 'Sex' }));
    expect(state.log).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Protected' })); });
    expect(state.log).toHaveBeenCalledWith(expect.objectContaining({ id: 'sex' }), { label: 'Protected', value: 'yes-protected' });
  });

  it('birth control: an untaken pill IS the one action', async () => {
    renderHome('contraception');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Took my pill' })); });
    expect(state.log).toHaveBeenCalledWith(expect.objectContaining({ id: 'pill' }), undefined);
    expect(screen.getByRole('button', { name: 'Log something else' })).toBeInTheDocument();
  });
});
