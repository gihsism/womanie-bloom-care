import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PeriodLateCard from './PeriodLateCard';

const start = new Date(2026, 9, 1);

describe('PeriodLateCard', () => {
  beforeEach(() => localStorage.clear());

  it('shows from 5 days late and logs the period', () => {
    const onLog = vi.fn();
    render(<PeriodLateCard userId="u1" mode="menstrual-cycle" periodDaysUntil={-6} lastPeriodStart={start} onLog={onLog} />);
    expect(screen.getByText('Your period is 6 days later than predicted')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'It started: log it' }));
    expect(onLog).toHaveBeenCalled();
  });

  it('renders nothing when only a little late', () => {
    const { container } = render(<PeriodLateCard userId="u1" mode="menstrual-cycle" periodDaysUntil={-2} lastPeriodStart={start} onLog={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Hide keeps it away for this cycle only', () => {
    const { unmount } = render(<PeriodLateCard userId="u1" mode="menstrual-cycle" periodDaysUntil={-6} lastPeriodStart={start} onLog={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByTestId('period-late-card')).toBeNull();
    unmount();
    render(<PeriodLateCard userId="u1" mode="menstrual-cycle" periodDaysUntil={-6} lastPeriodStart={start} onLog={() => {}} />);
    expect(screen.queryByTestId('period-late-card')).toBeNull();
    // A new period logged: it can come back.
    render(<PeriodLateCard userId="u1" mode="menstrual-cycle" periodDaysUntil={-6} lastPeriodStart={new Date(2026, 10, 1)} onLog={() => {}} />);
    expect(screen.getByTestId('period-late-card')).toBeInTheDocument();
  });
});
