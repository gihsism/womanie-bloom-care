import { cloneElement } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PatientTrends from './PatientTrends';
import type { TrendsPayload } from '@/lib/patientTrends';

// recharts' ResponsiveContainer needs a measured box; jsdom has none.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      cloneElement(children, { width: 360, height: 140 } as Record<string, number>),
  };
});

const payload: TrendsPayload = {
  periods: [
    { start: '2026-07-01', end: '2026-07-05' },
    { start: '2026-07-29', end: '2026-08-02' },
    { start: '2026-08-27', end: null },
  ],
  signals: [{ date: '2026-10-01', symptoms: ['cramps'], bbt: null }],
  weights: [],
  bloodPressure: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('PatientTrends', () => {
  it('fetches through the consent-gated endpoint and shows only charts with data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    const onLoaded = vi.fn();
    render(<PatientTrends patientId="p 1" cached={null} onLoaded={onLoaded} />);
    expect(await screen.findByText('Cycle length')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/doctors/patient-trends?id=p%201');
    expect(screen.getByText('Cycles 28–29 days, regular (last 2).')).toBeInTheDocument();
    expect(screen.getByText('Period length')).toBeInTheDocument();
    expect(screen.getByText('Symptoms, last 90 days')).toBeInTheDocument();
    expect(screen.queryByText('Weight')).not.toBeInTheDocument();
    expect(screen.queryByText('Blood pressure')).not.toBeInTheDocument();
    expect(screen.getAllByText('Show values').length).toBeGreaterThan(0);
    expect(onLoaded).toHaveBeenCalledWith(payload);
  });

  it('uses the cached answer without fetching again', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PatientTrends patientId="p1" cached={payload} onLoaded={vi.fn()} />);
    expect(screen.getByText('Cycle length')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains an empty chart', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<PatientTrends patientId="p1" cached={{ periods: [], signals: [], weights: [], bloodPressure: [] }} onLoaded={vi.fn()} />);
    expect(screen.getByText(/No trends yet/)).toBeInTheDocument();
  });

  it('says so when the trends cannot be loaded (e.g. access revoked)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PatientTrends patientId="p1" cached={null} onLoaded={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeInTheDocument());
  });
});
