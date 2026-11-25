import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PatientVisits from './PatientVisits';

const apt = (id: string, scheduled_at: string, status: string | null = 'scheduled') =>
  ({ id, scheduled_at, status, consultation_type: 'in_person', notes: null });

describe('PatientVisits (doctor): questions under the visit they belong to', () => {
  it('shows each visit\'s saved questions read-only, under that visit only', () => {
    render(
      <PatientVisits
        appointments={[apt('a1', '2099-12-10T09:00:00Z'), apt('a2', '2099-12-01T09:00:00Z')]}
        visitQuestions={[
          { appointment_id: 'a1', scheduled_at: '2099-12-10T09:00:00Z', updated_at: null, questions: [
            { id: 'x', text: 'Is my iron low?', asked: false },
            { id: 'y', text: 'Can I travel?', asked: true },
          ] },
        ]}
      />,
    );
    expect(screen.getByText("Questions she's bringing (2) · written by the patient")).toBeInTheDocument();
    expect(screen.getByText('Is my iron low?')).toBeInTheDocument();
    expect(screen.getByText('Can I travel?').className).toMatch(/line-through/);
    expect(screen.getAllByLabelText("Questions she's bringing to this visit")).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('no questions block for a cancelled visit or when none were saved', () => {
    render(
      <PatientVisits
        appointments={[apt('a1', '2099-12-10T09:00:00Z', 'cancelled'), apt('a2', '2099-12-01T09:00:00Z')]}
        visitQuestions={[
          { appointment_id: 'a1', scheduled_at: '2099-12-10T09:00:00Z', updated_at: null, questions: [{ id: 'x', text: 'Hidden?', asked: false }] },
          { appointment_id: 'a2', scheduled_at: '2099-12-01T09:00:00Z', updated_at: null, questions: '[]' },
        ]}
      />,
    );
    expect(screen.queryByText('Hidden?')).toBeNull();
    expect(screen.queryByLabelText("Questions she's bringing to this visit")).toBeNull();
  });
});
