import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from './NotFound';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

describe('NotFound', () => {
  it('opts out of the install banner so "Go back" is never covered on phones', () => {
    const { container } = render(<MemoryRouter><NotFound /></MemoryRouter>);
    expect(container.querySelector('[data-hide-install-banner]')).not.toBeNull();
  });

  it('shows "Go back" above the list of pages, not at the very bottom', () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    const back = screen.getByRole('button', { name: /go back/i });
    const records = screen.getByText('Records');
    expect(back.compareDocumentPosition(records) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
