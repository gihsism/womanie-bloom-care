import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format, subDays } from 'date-fns';
import BabyGrowthChart from './BabyGrowthChart';

// jsdom has no ResizeObserver (recharts' ResponsiveContainer needs one).
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;

const birth = format(subDays(new Date(), 56), 'yyyy-MM-dd');
const ev = (id: string, daysAgo: number, g: number) => ({
  id, occurred_at: new Date(`${format(subDays(new Date(), daysAgo), 'yyyy-MM-dd')}T12:00:00`).toISOString(), data: { weight_g: g },
});

function setup(over: Partial<Parameters<typeof BabyGrowthChart>[0]> = {}) {
  const props = {
    babyName: 'Lou', birthDate: birth, sex: 'female', events: [ev('a', 56, 3300), ev('b', 0, 4600)],
    onSaveWeight: vi.fn(async () => true), onSetSex: vi.fn(async () => true), onSetBirthDate: vi.fn(async () => true),
    ...over,
  };
  render(<BabyGrowthChart {...props} />);
  return props;
}

// Stub the photo shrink step: jsdom cannot decode images.
beforeEach(() => {
  Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
  Object.defineProperty(globalThis.Image.prototype, 'src', {
    configurable: true,
    set(this: HTMLImageElement) { Object.defineProperty(this, 'naturalWidth', { value: 800 }); Object.defineProperty(this, 'naturalHeight', { value: 600 }); setTimeout(() => this.onload?.(new Event('load'))); },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,QUJD');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('BabyGrowthChart', () => {
  it('shows the latest point as a neutral percentile line', () => {
    setup();
    expect(screen.getByTestId('growth-latest').textContent).toMatch(/^4\.6 kg at 8 weeks, around the \d+(st|nd|rd|th) percentile$/);
    expect(screen.getByText('Babies often move between lines in the first weeks. Your midwife or paediatrician looks at the trend.')).toBeTruthy();
  });

  it('asks for the sex before showing percentiles', async () => {
    const p = setup({ sex: null });
    expect(screen.queryByTestId('growth-chart')).toBeNull();
    expect(screen.getByTestId('growth-latest').textContent).toBe('4.6 kg at 8 weeks');
    await userEvent.click(screen.getByRole('button', { name: 'Girl' }));
    expect(p.onSetSex).toHaveBeenCalledWith('female');
  });

  it('typed weight: validates, then saves in grams as typed', async () => {
    const p = setup();
    const input = screen.getByLabelText('Weight (kg)');
    await userEvent.type(input, '30');
    await userEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(screen.getByText('Enter a weight between 0.5 kg and 25 kg.')).toBeTruthy();
    expect(p.onSaveWeight).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'g' }));
    await userEvent.clear(screen.getByLabelText('Weight (g)'));
    await userEvent.type(screen.getByLabelText('Weight (g)'), '4720');
    await userEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(p.onSaveWeight).toHaveBeenCalledWith({ measuredOn: format(new Date(), 'yyyy-MM-dd'), weightG: 4720, source: 'typed' });
    expect(await screen.findByText('Weight saved.')).toBeTruthy();
  });

  it('photo: pre-fills the read value, never saves until she taps Save, saves her correction as a photo reading', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ weight_kg: 4.62, confidence: 0.92 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = setup();
    await userEvent.upload(screen.getByTestId('scale-photo-input'), new File(['x'], 'scale.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect((screen.getByLabelText('Weight (kg)') as HTMLInputElement).value).toBe('4.62'));
    expect(screen.getByTestId('scale-photo-note').textContent).toMatch(/Read from the photo: 4\.62 kg\. Check it matches the scale/);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/baby/scale-photo');
    expect(JSON.parse(String(init.body))).toEqual({ image: 'QUJD', mediaType: 'image/jpeg' });
    expect(p.onSaveWeight).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Weight (kg)'));
    await userEvent.type(screen.getByLabelText('Weight (kg)'), '4.68');
    await userEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(p.onSaveWeight).toHaveBeenCalledWith({ measuredOn: format(new Date(), 'yyyy-MM-dd'), weightG: 4680, source: 'photo' });
    vi.unstubAllGlobals();
  });

  it('photo that cannot be read: friendly message, field stays empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ weight_kg: null, confidence: 0 }), { status: 200 })));
    const p = setup();
    await userEvent.upload(screen.getByTestId('scale-photo-input'), new File(['x'], 'blurry.jpg', { type: 'image/jpeg' }));
    expect((await screen.findByTestId('scale-photo-note')).textContent).toMatch(/couldn’t read a number on this photo/);
    expect((screen.getByLabelText('Weight (kg)') as HTMLInputElement).value).toBe('');
    expect(p.onSaveWeight).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
