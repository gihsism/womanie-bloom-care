import { describe, it, expect } from 'vitest';
import { buildIcs, type IcsEvent } from './ics';

const baseEvent: IcsEvent = {
  uid: 'appt-123',
  start: new Date(Date.UTC(2026, 5, 15, 9, 0, 0)), // 2026-06-15T09:00:00Z
  durationMinutes: 30,
  title: 'Gynecology appointment',
};

describe('buildIcs', () => {
  it('wraps a single VEVENT in a VCALENDAR', () => {
    const ics = buildIcs(baseEvent);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('VERSION:2.0');
  });

  it('namespaces the UID to womanie.info', () => {
    expect(buildIcs(baseEvent)).toContain('UID:appt-123@womanie.info');
  });

  it('formats start/end as UTC and applies the duration', () => {
    const ics = buildIcs(baseEvent);
    expect(ics).toContain('DTSTART:20260615T090000Z');
    expect(ics).toContain('DTEND:20260615T093000Z');
  });

  it('rolls the end time across the hour boundary', () => {
    const ics = buildIcs({ ...baseEvent, start: new Date(Date.UTC(2026, 5, 15, 9, 45, 0)), durationMinutes: 30 });
    expect(ics).toContain('DTSTART:20260615T094500Z');
    expect(ics).toContain('DTEND:20260615T101500Z');
  });

  it('uses CRLF line separators per RFC 5545', () => {
    expect(buildIcs(baseEvent)).toContain('\r\n');
  });

  it('includes a 15-minute display alarm', () => {
    const ics = buildIcs(baseEvent);
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics).toContain('ACTION:DISPLAY');
  });

  it('escapes special characters in text fields', () => {
    const ics = buildIcs({ ...baseEvent, title: 'Dr. Smith, OB; follow-up' });
    expect(ics).toContain('SUMMARY:Dr. Smith\\, OB\\; follow-up');
  });

  it('escapes backslashes and newlines in the description', () => {
    const ics = buildIcs({ ...baseEvent, description: 'line1\nline2 \\ end' });
    expect(ics).toContain('DESCRIPTION:line1\\nline2 \\\\ end');
  });

  it('omits optional event fields when not provided', () => {
    const ics = buildIcs(baseEvent);
    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('URL:');
    // The only DESCRIPTION present is the VALARM's, which mirrors the title.
    const descLines = ics.split('\r\n').filter((l) => l.startsWith('DESCRIPTION:'));
    expect(descLines).toEqual([`DESCRIPTION:${baseEvent.title}`]);
  });

  it('includes optional fields when provided', () => {
    const ics = buildIcs({
      ...baseEvent,
      description: 'Bring lab results',
      location: 'Zürich clinic',
      url: 'https://womanie.info/appt',
    });
    expect(ics).toContain('DESCRIPTION:Bring lab results');
    expect(ics).toContain('LOCATION:Zürich clinic');
    expect(ics).toContain('URL:https://womanie.info/appt');
  });
});
