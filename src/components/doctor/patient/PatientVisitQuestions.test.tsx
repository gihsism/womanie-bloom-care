import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PatientVisitQuestions from './PatientVisitQuestions';

describe('PatientVisitQuestions (doctor, read-only)', () => {
  it('shows the soonest visit with questions, read-only, asked ones struck through', () => {
    render(
      <PatientVisitQuestions
        rows={[
          { appointment_id: 'b', scheduled_at: '2026-12-10T09:00:00Z', updated_at: null, questions: [{ id: 'z', text: 'Later visit?', asked: false }] },
          { appointment_id: 'a', scheduled_at: '2026-12-01T09:00:00Z', updated_at: null, questions: JSON.stringify([
            { id: 'x', text: 'Is my iron low?', asked: false },
            { id: 'y', text: 'Can I travel?', asked: true },
          ]) },
        ]}
      />,
    );
    expect(screen.getByText("Questions she's bringing")).toBeInTheDocument();
    expect(screen.getByText('Is my iron low?')).toBeInTheDocument();
    expect(screen.getByText('Can I travel?').className).toMatch(/line-through/);
    expect(screen.queryByText('Later visit?')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders nothing when she saved no questions', () => {
    const { container } = render(<PatientVisitQuestions rows={[{ appointment_id: 'a', scheduled_at: '2026-12-01T09:00:00Z', updated_at: null, questions: [] }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
