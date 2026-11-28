import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format, subDays } from 'date-fns';
import BabyGrowthChart from './BabyGrowthChart';

// jsdom has no ResizeObserver (recharts' ResponsiveContainer needs one).
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;

const birth = format(subDays(new Date(), 56), 'yyyy-MM-dd');
const ev = (id: string, daysAgo: number, g: number | null, length_cm: number | null = null, head_cm: number | null = null) => ({
  id, occurred_at: new Date(`${format(subDays(new Date(), daysAgo), 'yyyy-MM-dd')}T12:00:00`).toISOString(), data: { weight_g: g, length_cm, head_cm },
});
const todayIso = () => format(new Date(), 'yyyy-MM-dd');

function setup(over: Partial<Parameters<typeof BabyGrowthChart>[0]> = {}) {
  const props = {
    babyName: 'Lou', birthDate: birth, sex: 'female', events: [ev('a', 56, 3300), ev('b', 0, 4600)],
    onSaveMeasurement: vi.fn(async () => true), onSetSex: vi.fn(async () => true), onSetBirthDate: vi.fn(async () => true),
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

  it('while the measurements load: "…", not the "Add a weight" prompt', () => {
    setup({ events: [], loaded: false });
    expect(screen.getByTestId('growth-loading')).toHaveTextContent('Loading');
    expect(screen.queryByText(/Add a weight to see where/)).toBeNull();
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
    await userEvent.click(screen.getByRole('button', { name: 'Save measurement' }));
    expect(screen.getByText('Enter a weight between 0.5 kg and 25 kg.')).toBeTruthy();
    expect(p.onSaveMeasurement).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'g' }));
    await userEvent.clear(screen.getByLabelText('Weight (g)'));
    await userEvent.type(screen.getByLabelText('Weight (g)'), '4720');
    await userEvent.click(screen.getByRole('button', { name: 'Save measurement' }));
    expect(p.onSaveMeasurement).toHaveBeenCalledWith({ measuredOn: todayIso(), weightG: 4720, lengthCm: null, headCm: null, source: 'typed' });
    expect(await screen.findByText('Measurement saved.')).toBeTruthy();
  });

  it('one form, one record: weight, length and head saved together', async () => {
    const p = setup();
    expect(screen.getAllByRole('button', { name: 'Save measurement' })).toHaveLength(1);
    await userEvent.type(screen.getByLabelText('Weight (kg)'), '4,7');
    await userEvent.type(screen.getByLabelText('Length (cm)'), '57.5');
    await userEvent.type(screen.getByLabelText('Head circumference (cm)'), '38,2');
    await userEvent.click(screen.getByRole('button', { name: 'Save measurement' }));
    expect(p.onSaveMeasurement).toHaveBeenCalledTimes(1);
    expect(p.onSaveMeasurement).toHaveBeenCalledWith({ measuredOn: todayIso(), weightG: 4700, lengthCm: 57.5, headCm: 38.2, source: 'typed' });
    await screen.findByText('Measurement saved.');
    expect((screen.getByLabelText('Length (cm)') as HTMLInputElement).value).toBe('');
  });

  it('length or head alone is fine; empty form and out-of-range values are not', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Save measurement' }));
    expect(screen.getByText('Enter a weight, length or head circumference.')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Head circumference (cm)'), '90');
    await userEvent.click(screen.getByRole('button', { name: 'Save measurement' }));
    expect(screen.getByText('Enter a head circumference between 20 cm and 60 cm.')).toBeTruthy();
    expect(screen.getByLabelText('Head circumference (cm)').getAttribute('aria-invalid')).toBe('true');
    expect(p.onSaveMeasurement).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Head circumference (cm)'));
    await userEvent.type(screen.getByLabelText('Length (cm)'), '56');
    await userEvent.click(screen.getByRole('button', { name: 'Save measurement' }));
    expect(p.onSaveMeasurement).toHaveBeenCalledWith({ measuredOn: todayIso(), weightG: null, lengthCm: 56, headCm: null, source: 'typed' });
  });

  it('Weight / Length / Head tabs switch the chart and its sentence', async () => {
    setup({ events: [ev('a', 56, 3300, 50, 34), ev('b', 0, 4600, 57.5, 38.5)] });
    expect(screen.getByRole('heading', { name: 'Weight for age' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Weight' }).getAttribute('aria-selected')).toBe('true');
    await userEvent.click(screen.getByRole('tab', { name: 'Length' }));
    expect(screen.getByRole('heading', { name: 'Length for age' })).toBeTruthy();
    expect(screen.getByTestId('growth-latest').textContent).toMatch(/^57\.5 cm at 8 weeks, around the \d+(st|nd|rd|th) percentile$/);
    await userEvent.click(screen.getByRole('tab', { name: 'Head' }));
    expect(screen.getByRole('heading', { name: 'Head circumference for age' })).toBeTruthy();
    expect(screen.getByTestId('growth-latest').textContent).toMatch(/^38\.5 cm at 8 weeks, around the \d+(st|nd|rd|th) percentile$/);
    expect(screen.getByText('Babies often move between lines in the first weeks. Your midwife or paediatrician looks at the trend.')).toBeTruthy();
  });

  it('a tab with no measurements yet asks for one, neutrally', async () => {
    setup();
    await userEvent.click(screen.getByRole('tab', { name: 'Head' }));
    expect(screen.queryByTestId('growth-latest')).toBeNull();
    expect(screen.getByText('Add a head circumference to see where Lou is on the chart.')).toBeTruthy();
  });

  it('photo: pre-fills the read value, never saves until she taps Save, saves her correction as a photo reading', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ weight_kg: 4.62, confidence: 0.92 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = setup();
    await userEvent.upload(screen.getByTestId('scale-photo-input'), new File(['x'], 'scale.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect((screen.getByLabelText('Weight (kg)') as HTMLInputElement).value).toBe('4.62'));
    expect(screen.getByTestId('scale-photo-note').textContent).toMatch(/Read from the photo: 4\.62 kg\. Check it matches the scale, correct it if needed, then tap Save measurement\./);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/baby/scale-photo');
    expect(JSON.parse(String(init.body))).toEqual({ image: 'QUJD', mediaType: 'image/jpeg' });
    expect(p.onSaveMeasurement).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Weight (kg)'));
    await userEvent.type(screen.getByLabelText('Weight (kg)'), '4.68');
    await userEvent.type(screen.getByLabelText('Length (cm)'), '57');
    await userEvent.click(screen.getByRole('button', { name: 'Save measurement' }));
    expect(p.onSaveMeasurement).toHaveBeenCalledWith({ measuredOn: todayIso(), weightG: 4680, lengthCm: 57, headCm: null, source: 'photo' });
    vi.unstubAllGlobals();
  });

  it('photo of a scale in pounds or grams: says what the scale showed and the kg it pre-filled', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ weight_kg: 4.63, confidence: 0.97, shown: '10.2 lb' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    await userEvent.upload(screen.getByTestId('scale-photo-input'), new File(['x'], 'scale.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect((screen.getByLabelText('Weight (kg)') as HTMLInputElement).value).toBe('4.63'));
    expect(screen.getByTestId('scale-photo-note').textContent).toBe('Read from the photo: 10.2 lb (4.63 kg). Check it matches the scale, correct it if needed, then tap Save measurement.');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ weight_kg: 4.62, confidence: 0.97, shown: '4620 g' }), { status: 200 }));
    await userEvent.upload(screen.getByTestId('scale-photo-input'), new File(['x'], 'scale2.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(screen.getByTestId('scale-photo-note').textContent).toMatch(/^Read from the photo: 4620 g \(4\.62 kg\)\. Check it matches the scale/));
    vi.unstubAllGlobals();
  });

  it('photo that cannot be read: friendly message, field stays empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ weight_kg: null, confidence: 0 }), { status: 200 })));
    const p = setup();
    await userEvent.upload(screen.getByTestId('scale-photo-input'), new File(['x'], 'blurry.jpg', { type: 'image/jpeg' }));
    expect((await screen.findByTestId('scale-photo-note')).textContent).toMatch(/couldn’t read a number on this photo/);
    expect((screen.getByLabelText('Weight (kg)') as HTMLInputElement).value).toBe('');
    expect(p.onSaveMeasurement).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('lists the measurements newest first with the WHO percentile under each value; remove works', async () => {
    const onRemove = vi.fn();
    setup({ events: [ev('a', 56, 3300), ev('b', 28, 4000, 53.5, 36.4)], onRemove });
    const rows = screen.getAllByTestId('growth-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('4.00 kg');
    expect(rows[0].textContent).toContain('4 weeks');
    expect(rows[0].textContent?.match(/\d+(st|nd|rd|th) percentile/g)).toHaveLength(3);
    expect(rows[1].textContent).toContain('—');
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove entry' })[1]);
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('no sex yet: values without percentiles', () => {
    setup({ sex: null });
    const rows = screen.getAllByTestId('growth-row');
    expect(rows[0].textContent).toContain('4.60 kg');
    expect(rows[0].textContent).not.toMatch(/percentile/);
  });
});
