import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// No lab results yet: the stage cards would show "Upload your blood tests".
vi.mock('@/hooks/useLabResults', () => ({ useLabResults: () => ({ labs: [], loading: false }) }));

import PregnancyLabInsights from '@/components/dashboard/PregnancyLabInsights';
import CycleLabInsights from '@/components/dashboard/CycleLabInsights';
import ModeLabInsights from '@/components/dashboard/ModeLabInsights';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('one upload button per page', () => {
  it('shows the upload card on its own', () => {
    wrap(<PregnancyLabInsights />);
    expect(screen.getByText('Upload your blood tests')).toBeTruthy();
  });

  it.each([
    ['pregnancy', <PregnancyLabInsights hideUploadCard />],
    ['cycle', <CycleLabInsights mode="menstrual-cycle" hideUploadCard />],
    ['other stages', <ModeLabInsights mode="menopause" hideUploadCard />],
  ])('%s: hides it when the page has its primary upload button', (_n, ui) => {
    wrap(ui);
    expect(screen.queryByText(/Upload (your )?blood tests/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload documents' })).toBeNull();
  });

  it('Records passes the flag whenever "Upload a document" is shown', () => {
    const records = readFileSync(resolve(__dirname, '../../pages/MedicalHistory.tsx'), 'utf8');
    expect(records).toContain('hideUploadCard={Boolean(uploadButton)}');
  });
});
