import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IVFJourneyCard from './IVFJourneyCard';
import { EMPTY_IVF_PLAN, zonedTimeToUtc, type IvfPlan } from '@/lib/ivfJourney';

const Z = 'Europe/Zurich';
const plan: IvfPlan = {
  ...EMPTY_IVF_PLAN,
  stimStart: '2026-11-10',
  triggerAt: zonedTimeToUtc('2026-11-20', '21:30', Z).toISOString(),
  triggerTz: Z,
  retrieval: '2026-11-22',
};

describe('IVFJourneyCard', () => {
  it('shows stim day, the next key date with the trigger time, and the steps', () => {
    render(<IVFJourneyCard plan={plan} tz={Z} now={zonedTimeToUtc('2026-11-17', '09:00', Z)} fallbackPhase={null} serverOk saveState="idle" onSave={vi.fn()} />);
    expect(screen.getByTestId('ivf-stim-day')).toHaveTextContent('Stim day 8');
    expect(screen.getByTestId('ivf-next')).toHaveTextContent('Trigger shot · Fri 20 Nov, 21:30 · in 3 days');
    expect(screen.queryByText('Down-regulation')).toBeNull();
  });

  it('saves edited dates and keeps the trigger time', async () => {
    const onSave = vi.fn(async () => 'saved' as const);
    render(<IVFJourneyCard plan={plan} tz={Z} now={zonedTimeToUtc('2026-11-17', '09:00', Z)} fallbackPhase={null} serverOk saveState="idle" onSave={onSave} />);
    fireEvent.click(screen.getByTestId('ivf-edit-dates'));
    fireEvent.change(screen.getByLabelText('Embryo transfer'), { target: { value: '2026-11-27' } });
    fireEvent.click(screen.getByTestId('ivf-save-dates'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ transfer: '2026-11-27', triggerAt: plan.triggerAt, stimStart: '2026-11-10' }));
  });
});
