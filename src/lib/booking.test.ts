import { describe, it, expect } from 'vitest';
import { bookingFailure, formatPrice, formatVisitWhen, formatPracticeShortDate, recentlyBooked, visitTypeLabel } from './booking';

describe('bookingFailure', () => {
  it('maps a 409 and the server codes', () => {
    expect(bookingFailure(409, undefined)).toBe('slot_taken');
    expect(bookingFailure(409, 'slot_taken')).toBe('slot_taken');
    expect(bookingFailure(400, 'bookings_off')).toBe('bookings_off');
    expect(bookingFailure(400, 'not_bookable')).toBe('bookings_off');
    expect(bookingFailure(404, undefined)).toBe('bookings_off');
    expect(bookingFailure(400, 'past')).toBe('past');
    expect(bookingFailure(400, 'outside_hours')).toBe('outside_hours');
    expect(bookingFailure(500, undefined)).toBe('other');
    expect(bookingFailure(0, undefined)).toBe('other');
  });
});

describe('formatPrice', () => {
  it('hides an unset price but shows a free visit', () => {
    expect(formatPrice(null, 'CHF')).toBeNull();
    expect(formatPrice(undefined, 'CHF')).toBeNull();
    expect(formatPrice(0, 'CHF')).toBe('Free');
    expect(formatPrice(120, 'CHF')).toBe('CHF 120');
    expect(formatPrice(99.5, 'EUR')).toBe('EUR 99.50');
    expect(formatPrice(80, null)).toBe('CHF 80');
  });
});

describe('visit time wording', () => {
  // 09:00 UTC on 6 Jan 2099 = 10:00 Zurich (winter).
  const at = new Date('2099-01-06T09:00:00Z');
  it('reads the time in Swiss time, labelled only for viewers abroad', () => {
    expect(formatVisitWhen(at, false)).toBe('Tuesday 6 January 2099 at 10:00');
    expect(formatVisitWhen(at, true)).toBe('Tuesday 6 January 2099 at 10:00 (Swiss time)');
    expect(formatPracticeShortDate(at)).toBe('Tue 6 Jan');
  });
  it('labels visit types', () => {
    expect(visitTypeLabel('video')).toBe('Video call');
    expect(visitTypeLabel('in_person')).toBe('In person');
    expect(visitTypeLabel(null)).toBe('In person');
  });
});

describe('recentlyBooked', () => {
  const now = new Date('2099-01-05T12:00:00Z');
  const row = (over: Record<string, unknown>) => ({
    id: 'a', scheduled_at: '2099-01-06T09:00:00Z', status: 'scheduled', booked_at: '2099-01-05T11:00:00Z', ...over,
  });
  it('keeps upcoming active visits booked in the last 7 days, soonest first', () => {
    const r = recentlyBooked([
      row({ id: 'later', scheduled_at: '2099-01-09T09:00:00Z' }),
      row({ id: 'soon' }),
    ], now);
    expect(r.map(x => x.id)).toEqual(['soon', 'later']);
  });
  it('skips cancelled, past, old or undated bookings', () => {
    expect(recentlyBooked([
      row({ status: 'cancelled' }),
      row({ scheduled_at: '2099-01-04T09:00:00Z' }),
      row({ booked_at: '2098-12-20T09:00:00Z' }),
      row({ booked_at: null }),
      row({ booked_at: 'garbage' }),
    ], now)).toEqual([]);
  });
  it('treats a missing status as scheduled', () => {
    expect(recentlyBooked([row({ status: null })], now)).toHaveLength(1);
  });
});
