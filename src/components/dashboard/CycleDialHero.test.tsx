import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Live (QA 2026-11-26): last period 4 Nov, 28-day cycle, on 3 Dec Home's
// Today list said "Period 1 day late?" while the hero above it said
// "Day 30 of 56 · Next period in 27 days" (the prediction had rolled on to
// the next cycle). Without a prediction, the stored length wrapped to day 2.
const model = vi.hoisted(() => ({ value: { loaded: false, periodRecords: [] as unknown[], prediction: {} as Record<string, unknown> } }));
vi.mock('@/hooks/useCycleModel', () => ({ useCycleModel: () => model.value }));
vi.mock('@/integrations/db/client', () => ({ db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

import CycleDialHero from './CycleDialHero';

const show = () => render(
  <MemoryRouter><CycleDialHero lastPeriodStart={new Date(2026, 10, 4)} cycleLength={28} mode="menstrual-cycle" /></MemoryRouter>,
);

describe('CycleDialHero when the period is late', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 11, 3, 20, 0)); });
  afterEach(() => { vi.useRealTimers(); });

  it('says late, not "next period in 27 days", when the prediction rolled forward', () => {
    model.value = {
      loaded: true,
      periodRecords: [{ period_start_date: '2026-11-04' }],
      prediction: { predictedPeriodStart: new Date(2026, 11, 30), predictedOvulationDate: new Date(2026, 11, 16), averageCycleLength: 28, averagePeriodLength: 5 },
    };
    show();
    expect(screen.getByRole('heading', { level: 2 }).textContent?.trim()).toBe('Day 30');
    expect(screen.getByText('Period 1 day late? Log it if it started.')).toBeTruthy();
    expect(screen.queryByText(/Next period in/)).toBeNull();
  });

  it('does not wrap round to day 2 before the prediction has loaded', () => {
    model.value = { loaded: false, periodRecords: [], prediction: {} };
    show();
    expect(screen.getByRole('heading', { level: 2 }).textContent?.trim()).toBe('Day 30');
    expect(screen.getByText(/1 day late/)).toBeTruthy();
  });

  it('on time it still shows "Day N of L" and the next period', () => {
    vi.setSystemTime(new Date(2026, 10, 26, 12, 0));
    model.value = { loaded: false, periodRecords: [], prediction: {} };
    show();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/Day 23\s*of 28/);
    expect(screen.getByText(/Next period in 6 days/)).toBeTruthy();
  });
});
