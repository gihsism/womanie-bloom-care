import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PatientBirthPlan from './PatientBirthPlan';
import { BirthPlanSheet } from '@/pages/dashboard/PrintBirthPlan';

const plan = { v: 1, choices: { place: ['geburtshaus'], pain: ['epidural'] }, notes: { special: 'Needs a German–Russian interpreter' } };

describe('PatientBirthPlan (doctor, read-only)', () => {
  it('lists her filled sections with option labels and notes, no controls', () => {
    render(<PatientBirthPlan row={{ plan: JSON.stringify(plan), updated_at: '2026-11-20T10:00:00Z' }} />);
    expect(screen.getByText('Birth plan')).toBeInTheDocument();
    expect(screen.getByText('Birth centre (Geburtshaus)')).toBeInTheDocument();
    expect(screen.getByText("I'd like to discuss an epidural (PDA)")).toBeInTheDocument();
    expect(screen.getByText(/German–Russian interpreter/)).toBeInTheDocument();
    expect(screen.queryByText('Feeding')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders nothing when nothing is shared or the plan is empty', () => {
    expect(render(<PatientBirthPlan row={null} />).container).toBeEmptyDOMElement();
    expect(render(<PatientBirthPlan row={{ plan: {}, updated_at: null }} />).container).toBeEmptyDOMElement();
  });
});

describe('BirthPlanSheet (print)', () => {
  it('prints her name, due date, filled sections and the "plans can change" footer', () => {
    render(<BirthPlanSheet data={{ name: 'Anna', dueDate: '2027-01-15', plan: plan as never }} now={new Date(2026, 10, 26)} />);
    expect(screen.getByRole('heading', { name: 'Anna' })).toBeInTheDocument();
    expect(screen.getByText(/Due/)).toBeInTheDocument();
    expect(screen.getByText('Where I plan to give birth')).toBeInTheDocument();
    expect(screen.getByText(/plans can change/)).toBeInTheDocument();
  });

  it('says so when nothing is filled in', () => {
    render(<BirthPlanSheet data={{ name: null, dueDate: null, plan: { v: 1, choices: {}, notes: {} } }} />);
    expect(screen.getByText('No wishes filled in yet.')).toBeInTheDocument();
  });
});
