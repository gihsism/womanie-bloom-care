import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MissedPillGuidance from './MissedPillGuidance';

describe('MissedPillGuidance sheet', () => {
  it('pre-selects the hours from her pill time and updates the steps on a tap', () => {
    render(
      <MissedPillGuidance open onOpenChange={vi.fn()} pillType="combined" estimatedHours={30} packDay={3} onChangePillType={vi.fn()} />,
    );
    expect(screen.getByText('One pill missed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '24–48 h (one pill)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '48 h or more' }));
    expect(screen.getByText('Two or more pills missed')).toBeInTheDocument();
    expect(screen.getByText('Emergency contraception may be needed')).toBeInTheDocument();
    expect(screen.getByText(/ask your pharmacist or doctor/)).toBeInTheDocument();
  });
  it('desogestrel: 8 hours late is still protected', () => {
    render(
      <MissedPillGuidance open onOpenChange={vi.fn()} pillType="pop-desogestrel" estimatedHours={8} packDay={null} onChangePillType={vi.fn()} />,
    );
    expect(screen.getByText('Late, but you are still protected')).toBeInTheDocument();
  });
  it('names its sources and the 3-hour vomiting rule for the combined pill', () => {
    render(
      <MissedPillGuidance open onOpenChange={vi.fn()} pillType="combined" estimatedHours={2} packDay={null} onChangePillType={vi.fn()} />,
    );
    expect(screen.getByTestId('missed-pill-sources').textContent).toMatch(/FSRH .*CDC U\.S\. Selected Practice Recommendations/);
    expect(screen.getByText(/Vomiting within 3 hours of a pill/)).toBeInTheDocument();
  });
});
