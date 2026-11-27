import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PatientVisitBrief from './PatientVisitBrief';

const NOW = Date.parse('2026-11-25T12:00:00Z');

describe('PatientVisitBrief (doctor, before the visit)', () => {
  it('shows where she is, her medicines, mood and open questions in one card', () => {
    render(
      <PatientVisitBrief
        now={NOW}
        profile={{ id: 'p1', full_name: 'Anna', life_stage: 'menstrual-cycle', pregnancy_due_date: null, ivf_phase: null }}
        appointments={[{ id: 'a1', scheduled_at: '2026-12-01T09:00:00Z', status: 'scheduled', consultation_type: 'in_person', notes: null }]}
        periodRecords={[{ period_start_date: '2026-11-12', cycle_length: 28 }]}
        signals={[1, 2, 3, 4, 5, 6].map(i => ({ id: `s${i}`, signal_date: `2026-11-${10 + i}`, symptoms: null, mood: i < 6 ? ['anxious'] : ['calm'], discharge: null, notes: null }))}
        medicines={[{ id: 'm1', name: 'Iron', dose: '50 mg', times_per_day: 2, started_on: null }]}
        visitQuestions={[{ appointment_id: 'a1', scheduled_at: '2026-12-01T09:00:00Z', updated_at: null, questions: [
          { id: 'x', text: 'Is my iron low?', asked: false },
          { id: 'y', text: 'Can I travel?', asked: true },
        ] }]}
      />,
    );
    expect(screen.getByText('Before the visit')).toBeInTheDocument();
    expect(screen.getByText(/Next visit .*in person/)).toBeInTheDocument();
    expect(screen.getByText('Period tracking · cycle day 14')).toBeInTheDocument();
    expect(screen.getByText('Iron 50 mg, 2× a day')).toBeInTheDocument();
    expect(screen.getByText(/Low mood on 5 of 6 logged days/)).toBeInTheDocument();
    expect(screen.getByLabelText('Worth a look')).toBeInTheDocument();
    // Open questions listed in the brief; asked ones are not.
    expect(screen.getByTestId('brief-questions').textContent).toBe('Is my iron low?');
    expect(screen.queryByText('Can I travel?')).toBeNull();
    // Read-only: nothing to edit on the brief.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('calm empty state for a patient who logged nothing', () => {
    render(
      <PatientVisitBrief
        now={NOW}
        profile={{ id: 'p1', full_name: null, life_stage: 'pregnancy', pregnancy_due_date: '2027-03-01', ivf_phase: null }}
        appointments={[]}
        periodRecords={[{ period_start_date: '2026-11-12', cycle_length: 28 }]}
        signals={[]}
        medicines={[]}
        visitQuestions={[]}
      />,
    );
    expect(screen.getByText('No visit booked with you')).toBeInTheDocument();
    // Pregnancy shows the week, never a cycle day.
    expect(screen.getByText(/^Pregnancy · week \d+$/)).toBeInTheDocument();
    expect(screen.getByText('None recorded')).toBeInTheDocument();
    expect(screen.getByText('Not logged')).toBeInTheDocument();
    expect(screen.getByText('None saved')).toBeInTheDocument();
    expect(screen.getByText('No results yet')).toBeInTheDocument();
    expect(screen.queryByLabelText('Worth a look')).toBeNull();
  });

  it('lists the results worth raising by the prep-sheet rules (out of range, status change)', () => {
    const row = (id: string, title: string, value: string, status: string, date: string) => ({
      id, document_id: 'd', title, value, unit: 'ng/mL', reference_range: '30-400', status,
      data_type: 'lab_result', date_recorded: date, notes: null, raw_data: null,
    });
    render(
      <PatientVisitBrief
        now={NOW}
        profile={null}
        appointments={[]}
        periodRecords={[]}
        signals={[]}
        medicines={[]}
        visitQuestions={[]}
        medicalData={[
          row('1', 'Ferritin', '12', 'abnormal', '2026-11-01'),
          row('2', 'Ferritin', '40', 'normal', '2026-06-01'),
          row('3', 'Prolactin', '200', 'normal', '2026-11-01'),
        ]}
      />,
    );
    const list = screen.getByTestId('brief-results');
    expect(list.textContent).toContain('12 ng/mL');
    expect(list.textContent).toMatch(/Marked outside range; was 40 ng\/mL \(within range\)/);
    expect(list.textContent).not.toContain('Prolactin');
    expect(screen.getByLabelText('Worth a look')).toBeInTheDocument();
  });
});
