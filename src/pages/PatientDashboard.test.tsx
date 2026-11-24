import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { EMPTY_STATE } from '@/lib/quickLog/state';

// Renders Home (idea 4) with its data hooks stubbed, to check the short
// template: the stage header (chip that changes the stage, one big line,
// one sentence, two facts), one-tap tiles 3 per row that LOG on tap with
// an Undo, Today (needs-you rows ≤3 + what was logged), "More for
// <stage>" (≤4 rows) — and nothing else.

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

describe('Home template (idea 4)', () => {
  it.each(STAGES)('%s: header, tiles, Today, More — and nothing else', (mode) => {
    const { container } = renderHome(mode, 20);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /change life stage/i })).toHaveAttribute('href', '/dashboard/settings#life-stage');
    expect(container.querySelectorAll('header dd')).toHaveLength(2);
    const tiles = within(screen.getByRole('region', { name: 'Tap to log' })).getAllByRole('listitem');
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(6);
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Nothing logged yet today')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^More for / })).toBeInTheDocument();
    // no greeting, no single filled "primary" button, no old clutter
    expect(container.textContent).not.toMatch(/Good (morning|afternoon|evening)|\bMenu\b|Upload|Devices|Community|Daily Reminders|Quick Access/);
  });

  it('the tile grid is three per row', () => {
    renderHome('pregnancy', 30);
    expect(screen.getByRole('region', { name: 'Tap to log' }).querySelector('ul')!.className).toContain('grid-cols-3');
  });

  it('caps the needs-you rows at three', () => {
    state.signals = {
      appointmentToday: new Date(new Date().setHours(23, 0, 0, 0)),
      newDoctorNotes: 1,
      flaggedResults: 2,
      setup: { done: 1, total: 3 },
    };
    renderHome('menstrual-cycle');
    const today = screen.getByRole('heading', { name: 'Today' }).closest('section')!;
    expect(within(today).getAllByRole('button')).toHaveLength(3);
  });

  it('pregnancy week 30: tapping Kick logs at once and Undo deletes it', async () => {
    renderHome('pregnancy', 30);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Kick' })); });
    expect(state.log).toHaveBeenCalledWith(expect.objectContaining({ id: 'kick' }), undefined);
    expect(screen.getByRole('status')).toHaveTextContent('Kick logged · 10:42');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo' })); });
    expect(state.undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('"…" opens the details instead of logging; Note opens the Log sheet', () => {
    renderHome('pregnancy', 30);
    fireEvent.click(screen.getByRole('button', { name: 'Nausea: details' }));
    expect(state.log).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Log sheet: log');
  });

  it('a two-choice tile asks first, then logs the choice', async () => {
    renderHome('menstrual-cycle');
    fireEvent.click(screen.getByRole('button', { name: 'Sex' }));
    expect(state.log).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Protected' })); });
    expect(state.log).toHaveBeenCalledWith(expect.objectContaining({ id: 'sex' }), { label: 'Protected', value: 'yes-protected' });
  });
});
