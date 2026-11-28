import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';

// Renders Home with its data hooks stubbed, to check the short template:
// greeting + "· change", one hero, Today (≤3 rows), exactly one primary
// button, "More for <stage>" (≤4 rows) — and nothing else.

const state = vi.hoisted(() => ({
  mode: 'conception' as string,
  weeks: null as number | null,
  signals: {} as Record<string, unknown>,
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
  }),
}));
vi.mock('@/hooks/useTodaySignals', () => ({ useTodaySignals: () => state.signals }));
// Heroes read the database themselves; a stub is enough here (heroTrim.test covers their content).
vi.mock('@/components/dashboard/CycleDialHero', () => ({ default: () => <section data-testid="hero" /> }));
vi.mock('@/components/dashboard/PregnancyBodyMap', () => ({ default: () => <section data-testid="hero" /> }));
vi.mock('@/components/dashboard/BabyBodyMap', () => ({ default: () => <section data-testid="hero" /> }));
vi.mock('@/components/dashboard/PillRingHero', () => ({ default: () => <section data-testid="hero" /> }));
vi.mock('@/components/dashboard/MenopauseBodyMap', () => ({ default: () => <section data-testid="hero" /> }));
vi.mock('@/components/dashboard/IVFTimelineHero', () => ({ default: () => <section data-testid="hero" /> }));
vi.mock('@/components/dashboard/ModeHeroStat', () => ({ default: () => <section data-testid="hero" /> }));
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
});

const STAGES: LifeStage[] = ['pre-menstrual', 'menstrual-cycle', 'contraception', 'conception', 'ivf', 'pregnancy', 'postpartum', 'menopause', 'post-menopause'];

describe('Home template', () => {
  it.each(STAGES)('%s: five blocks, one primary button, at most 10 tappables', (mode) => {
    const { container } = renderHome(mode, 20);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/, Lena$/);
    expect(screen.getByRole('link', { name: /change life stage/i })).toHaveAttribute('href', '/dashboard/settings#life-stage');
    expect(screen.getAllByTestId('hero')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Nothing needs you today')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^More for / })).toBeInTheDocument();
    const tappables = container.querySelectorAll('a, button');
    expect(tappables.length).toBeLessThanOrEqual(10);
    expect(container.textContent).not.toMatch(/\bMenu\b|Upload|Devices|Community|Daily Reminders|Quick Access/);
  });

  it('shows three Today rows (the rest behind "N more") and opens the Log sheet from the primary button', async () => {
    state.signals = {
      appointmentToday: new Date(new Date().setHours(23, 0, 0, 0)),
      newDoctorNotes: 1,
      flaggedResults: 2,
      setup: { done: 1, total: 3 },
    };
    renderHome('menstrual-cycle');
    const today = screen.getByRole('heading', { name: 'Today' }).closest('section')!;
    expect(within(today).getAllByRole('listitem')).toHaveLength(3);
    expect(within(today).getByRole('button', { name: '1 more' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log today' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Log sheet: log');
  });

  it('pregnancy week 30: "Count kicks" is the filled button, and a quiet "Log today" still opens the log', async () => {
    renderHome('pregnancy', 30);
    const kicks = screen.getByRole('button', { name: 'Count kicks' });
    const log = screen.getByRole('button', { name: 'Log today' });
    expect(kicks.className).not.toMatch(/underline-offset/);
    expect(log.className).toMatch(/underline-offset/); // link variant, not a second filled button
    fireEvent.click(log);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Log sheet: log');
  });

  it.each([[28], [37]])('pregnancy week %i keeps a way into the log', async (w) => {
    renderHome('pregnancy', w);
    fireEvent.click(screen.getByRole('button', { name: 'Log today' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Log sheet: log');
  });

  it('stages whose filled button is the log get no extra link', () => {
    renderHome('pregnancy', 20);
    expect(screen.getAllByRole('button', { name: 'Log today' })).toHaveLength(1);
  });
});
