// Pure edits of today's daily_health_signals row, in exactly the format
// the Log sheet (DailyLogging) reads and writes, so a one-tap tile and the
// sheet always agree:
//   symptoms  text[]   ('Cramps', 'Headache', 'Back pain', 'Nausea', …)
//   mood      text[]   ('sad', 'anxious', 'tired', …)
//   notes     text     segments joined by ". ": "Flow: light", "Pill: on-time",
//                      "Hot flashes: 3", "Intercourse: yes-protected", free text …
// Every edit has an inverse, so Undo removes only what the tap added even
// when something else was logged in between.

export interface DailyRow {
  symptoms: string[] | null;
  mood: string[] | null;
  notes: string | null;
}

export const EMPTY_ROW: DailyRow = { symptoms: null, mood: null, notes: null };

/** Split notes the way DailyLogging joins them (". "), keeping decimals ("BBT: 36.6°C") whole. */
export function splitNotes(notes: string | null | undefined): string[] {
  return (notes ?? '').split(/\.\s+|\.$/).map(s => s.trim()).filter(Boolean);
}

const joinNotes = (parts: string[]): string | null => (parts.length ? parts.join('. ') : null);

const segRe = (label: string) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)$`, 'i');

export function getSegment(notes: string | null | undefined, label: string): string | null {
  const re = segRe(label);
  for (const p of splitNotes(notes)) {
    const m = p.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

/** Replace (or remove, with null) the "<label>: value" segment; other segments untouched. */
export function setSegment(notes: string | null | undefined, label: string, value: string | null): string | null {
  const re = segRe(label);
  const parts = splitNotes(notes);
  const i = parts.findIndex(p => re.test(p));
  if (value == null) {
    if (i >= 0) parts.splice(i, 1);
  } else if (i >= 0) {
    parts[i] = `${label}: ${value}`;
  } else {
    // Structured segments go before the free-text note, as the sheet writes them.
    const firstFree = parts.findIndex(p => !/^[A-Za-z ]+:\s/.test(p));
    if (firstFree >= 0) parts.splice(firstFree, 0, `${label}: ${value}`);
    else parts.push(`${label}: ${value}`);
  }
  return joinNotes(parts);
}

const addTo = (list: string[] | null, v: string): string[] => (list?.includes(v) ? list : [...(list ?? []), v]);
const removeFrom = (list: string[] | null, v: string): string[] | null => {
  const next = (list ?? []).filter(x => x !== v);
  return next.length ? next : null;
};

/**
 * One tile's change to the row: `apply` makes it, `revert` undoes only
 * that change. `already` is true when the tap changed nothing (already
 * logged today); then Undo must not remove what was there before.
 */
export interface RowEdit {
  apply: (r: DailyRow) => DailyRow;
  revert: (r: DailyRow) => DailyRow;
  already: (r: DailyRow) => boolean;
}

export function symptomEdit(value: string): RowEdit {
  return {
    apply: r => ({ ...r, symptoms: addTo(r.symptoms, value) }),
    revert: r => ({ ...r, symptoms: removeFrom(r.symptoms, value) }),
    already: r => !!r.symptoms?.includes(value),
  };
}

export function moodEdit(value: string): RowEdit {
  return {
    apply: r => ({ ...r, mood: addTo(r.mood, value) }),
    revert: r => ({ ...r, mood: removeFrom(r.mood, value) }),
    already: r => !!r.mood?.includes(value),
  };
}

/** A "<label>: value" segment. Revert restores the value it replaced. */
export function segmentEdit(label: string, value: string): RowEdit {
  let before: string | null = null;
  return {
    apply: r => {
      before = getSegment(r.notes, label);
      return { ...r, notes: setSegment(r.notes, label, value) };
    },
    revert: r => ({ ...r, notes: getSegment(r.notes, label)?.toLowerCase() === value.toLowerCase() ? setSegment(r.notes, label, before) : r.notes }),
    already: r => getSegment(r.notes, label)?.toLowerCase() === value.toLowerCase(),
  };
}

/** Hot flushes are a running count for the day ("Hot flashes: N"). */
export function hotFlushCount(r: DailyRow): number {
  const n = parseInt(getSegment(r.notes, 'Hot flashes') ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const hotFlushEdit: RowEdit = {
  apply: r => ({ ...r, notes: setSegment(r.notes, 'Hot flashes', String(hotFlushCount(r) + 1)) }),
  revert: r => {
    const n = hotFlushCount(r) - 1;
    return { ...r, notes: setSegment(r.notes, 'Hot flashes', n > 0 ? String(n) : null) };
  },
  already: () => false,
};
