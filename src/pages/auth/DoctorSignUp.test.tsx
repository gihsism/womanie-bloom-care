import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import DoctorSignUp from './DoctorSignUp';

describe('DoctorSignUp', () => {
  it('wears the clinic colours while open', () => {
    const { unmount } = render(<MemoryRouter><DoctorSignUp /></MemoryRouter>);
    expect(document.documentElement.getAttribute('data-stage')).toBe('clinic');
    unmount();
    expect(document.documentElement.getAttribute('data-stage')).not.toBe('clinic');
  });

  it('the "Specialty" label belongs to the specialty picker (it pointed at nothing)', () => {
    render(<MemoryRouter><DoctorSignUp /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'dr@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-password-1' } });
    fireEvent.change(screen.getByLabelText('Password again'), { target: { value: 'a-long-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('Specialty').getAttribute('role')).toBe('combobox');
  });
});
