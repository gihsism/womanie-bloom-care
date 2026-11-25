import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DoctorPatientList from './DoctorPatientList';

const base = { connection_type: 'code', created_at: '2026-01-01T00:00:00Z' };

describe('DoctorPatientList', () => {
  it('lets the doctor open only approved patients', () => {
    render(
      <MemoryRouter>
        <DoctorPatientList
          patients={[
            { ...base, id: 'c1', patient_id: 'p1', status: 'approved', patient_full_name: 'Anna', patient_life_stage: 'pregnancy' },
            { ...base, id: 'c2', patient_id: 'p2', status: 'pending', patient_full_name: 'Bea' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Anna/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bea/ })).toBeNull();
    expect(screen.getByText('Waiting for the patient to approve')).toBeTruthy();
    expect(screen.getByText('Pregnancy')).toBeTruthy();
  });

  it('shows a new doctor how to add her first patient', () => {
    render(
      <MemoryRouter>
        <DoctorPatientList patients={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /No patients yet/ })).toBeTruthy();
    const steps = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/Share with doctor/);
    expect(steps[1]).toMatch(/8-character code/);
    expect(steps[2]).toMatch(/approves/);
  });
});
