import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoctorSetupChecklist from './DoctorSetupChecklist';
import { computeSetupSteps } from '@/lib/doctorSetup';

describe('DoctorSetupChecklist', () => {
  it('says plainly that patients cannot find a new doctor yet, with progress', () => {
    render(<DoctorSetupChecklist steps={computeSetupSteps({ verification_status: 'pending' }, null, [])} onGo={() => {}} />);
    expect(screen.getByText(/cannot find you in Find a Doctor yet/)).toBeInTheDocument();
    expect(screen.getByText('0 of 7 done')).toBeInTheDocument();
    expect(screen.getByText(/checking your licence/)).toBeInTheDocument();
  });

  it('each open step jumps to its setting; the licence row is not a link', () => {
    const onGo = vi.fn();
    render(<DoctorSetupChecklist steps={computeSetupSteps({ verification_status: 'pending' }, null, [])} onGo={onGo} />);
    fireEvent.click(screen.getByRole('button', { name: /Accept new bookings/ }));
    expect(onGo).toHaveBeenCalledWith('setup-bookings');
    expect(screen.queryByRole('button', { name: /Licence verified/ })).toBeNull();
  });

  it('disappears once everything is done', () => {
    const steps = computeSetupSteps(
      { avatar_url: 'a', specialty: 's', languages: ['de'], verification_status: 'approved' },
      { is_available: true, consultation_price: 100 },
      [{ is_active: true, start_time: '09:00', end_time: '12:00' }],
    );
    const { container } = render(<DoctorSetupChecklist steps={steps} onGo={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
