import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/db/client', () => ({
  db: { from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }) },
}));
vi.mock('@/hooks/useUserHealthContext', async () => {
  const { assessAmh } = await import('@/lib/hormone-reference');
  return {
    useUserHealthContext: () => ({
      loaded: true, age: 33,
      labs: { amh: { key: 'amh', title: 'AMH', value: 0.8, unit: 'ng/mL', status: null, dateRecorded: '2026-10-01' } },
      amhAssessment: assessAmh(0.8, 33),
    }),
  };
});

import AmhAgeContext from './AmhAgeContext';

describe('AmhAgeContext egg-reserve headline', () => {
  it('uses soft wording with the age, never a "reserve age" number', () => {
    render(<MemoryRouter><AmhAgeContext mode="conception" /></MemoryRouter>);
    expect(screen.getByText('Lower than typical for 33')).toBeInTheDocument();
    expect(screen.getByText(/usual around 40–42/)).toBeInTheDocument();
    expect(screen.queryByText(/reserve age/i)).toBeNull();
  });
});
