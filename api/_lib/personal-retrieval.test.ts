import { describe, it, expect, vi } from 'vitest';
import {
  analytesInQuestion,
  fetchPersonalRows,
  selectPersonalContext,
  PERSONAL_LAB_SQL,
  PERSONAL_DOC_SQL,
  type LabRow,
  type DocRow,
} from './personal-retrieval';

const now = new Date('2026-11-25T12:00:00Z');

const lab = (title: string, value: string, date: string, extra: Partial<LabRow> = {}): LabRow => ({
  data_type: 'lab_result', title, value, unit: '', reference_range: '', status: 'normal', date_recorded: date, notes: '', ...extra,
});

// Four years of ferritin buried under lots of newer unrelated values, so the
// old "latest 100 rows" query would have lost the 2022-2024 readings.
const ferritin: LabRow[] = [
  lab('Ferritin', '9', '2022-03-01', { unit: 'ng/mL', status: 'low' }),
  lab('Serum Ferritin', '14', '2023-02-10', { unit: 'ng/mL', status: 'low' }),
  lab('ferritin', '22', '2024-01-20', { unit: 'ng/mL' }),
  lab('Ferritin (Serum)', '35', '2025-05-05', { unit: 'ng/mL' }),
  lab('Ferritin', '41', '2026-06-01', { unit: 'ng/mL' }),
];
const filler: LabRow[] = Array.from({ length: 150 }, (_, i) =>
  lab(['Sodium', 'Potassium', 'Glucose', 'Creatinine', 'ALT', 'MCV'][i % 6], String(100 + i), `2026-${String(1 + (i % 10)).padStart(2, '0')}-15`));
const abnormalTsh = lab('TSH', '6.8', '2026-09-01', { unit: 'mIU/L', status: 'high', reference_range: '0.4-4.0' });
const labs = [...filler, ...ferritin, abnormalTsh];
const docs: DocRow[] = [
  { ai_suggested_name: 'Iron panel 2023', ai_summary: 'Low ferritin, iron supplements advised.', ai_suggested_category: 'lab', uploaded_at: '2023-02-11' },
  { ai_suggested_name: 'Pelvic ultrasound', ai_summary: 'Normal uterus and ovaries.', ai_suggested_category: 'imaging', uploaded_at: '2026-04-01' },
];

describe('analytesInQuestion', () => {
  it('maps synonyms, abbreviations and other languages', () => {
    expect(analytesInQuestion('How has my ferritin changed since 2022?')).toContain('Ferritin');
    expect(analytesInQuestion('Mein Hb und Vit D?')).toEqual(new Set(['Hemoglobin', 'Vitamin D']));
    expect(analytesInQuestion('what is my 25-OH level')).toContain('Vitamin D');
    expect(analytesInQuestion('какой у меня ферритин и ТТГ')).toEqual(new Set(['Ferritin', 'TSH']));
    expect(analytesInQuestion('my HbA1c')).toContain('HbA1c');
    expect(analytesInQuestion('AMH result')).toContain('AMH');
    expect(analytesInQuestion('how is my thyroid')).toContain('TSH');
  });
  it('does not fire on ordinary words', () => {
    expect(analytesInQuestion('I got tired after the holiday')).toEqual(new Set());
    expect(analytesInQuestion('How can I sleep better?')).toEqual(new Set());
  });
});

describe('selectPersonalContext', () => {
  it('includes the full 4-year ferritin history with dates', () => {
    const sel = selectPersonalContext({ question: 'How has my ferritin changed since 2022?', labs, docs, now });
    for (const d of ['2022-03-01', '2023-02-10', '2024-01-20', '2025-05-05', '2026-06-01']) {
      expect(sel.block).toContain(`${d} Ferritin`);
    }
    expect(sel.block).toContain('Ferritin — full history (5 values');
    expect(sel.block.indexOf('2022-03-01 Ferritin')).toBeLessThan(sel.block.indexOf('2026-06-01 Ferritin'));
    expect(sel.block).toContain('Iron panel 2023'); // matching document
    expect(sel.block).not.toContain('Normal uterus'); // unrelated document summary
  });

  it('an unrelated question gets no lab rows beyond the baseline', () => {
    const sel = selectPersonalContext({ question: 'How can I sleep better?', labs, docs, now, baselineSize: 5 });
    expect(sel.stats.historyRows).toBe(0);
    expect(sel.stats.baseline).toBeLessThanOrEqual(5);
    const labLines = sel.block.split('\n').filter((l) => /^- \d{4}-\d{2}-\d{2} /.test(l));
    expect(labLines.length).toBe(sel.stats.baseline + sel.stats.abnormal);
    expect(sel.block).not.toContain('2022-03-01 Ferritin');
    expect(sel.block).not.toContain('Summary:');
  });

  it('always lists recent abnormal values', () => {
    for (const q of ['How can I sleep better?', 'How has my ferritin changed?', '']) {
      const sel = selectPersonalContext({ question: q, labs, docs, now });
      expect(sel.block).toContain('2026-09-01 TSH: 6.8 mIU/L (ref 0.4-4.0) [high]');
    }
  });

  it('keeps a follow-up on the previous analyte', () => {
    const sel = selectPersonalContext({ question: 'and what about since 2022?', previousQuestion: 'my ferritin?', labs, docs, now });
    expect(sel.block).toContain('2022-03-01 Ferritin');
  });

  it('respects the token budget, keeping the newest history values', () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      lab('Ferritin', String(i), `${1990 + Math.floor(i / 12)}-${String(1 + (i % 12)).padStart(2, '0')}-01`, { notes: 'x'.repeat(100) }));
    const sel = selectPersonalContext({ question: 'ferritin history', labs: [...labs, ...many], docs, now, tokenBudget: 800 });
    expect(sel.block.length).toBeLessThanOrEqual(800 * 4 + 1);
    expect(sel.stats.tokens).toBeLessThanOrEqual(801);
    expect(sel.block).toContain('older value(s) not shown for space');
    expect(sel.block).toContain('2026-06-01 Ferritin');
    expect(sel.block).not.toContain('1990-01-01 Ferritin');
    expect(sel.block).toContain('2026-09-01 TSH'); // abnormal value kept despite the long history
    // Default budget is honoured too.
    const def = selectPersonalContext({ question: 'ferritin', labs: [...labs, ...many], docs, now });
    expect(def.stats.tokens).toBeLessThanOrEqual(2501);
  });

  it('returns nothing when she has no records', () => {
    expect(selectPersonalContext({ question: 'ferritin?', labs: [], docs: [], now }).block).toBe('');
  });

  it('puts conditions, allergies and medicines in the always-on summary', () => {
    const sel = selectPersonalContext({
      question: 'hello', docs, now,
      labs: [...labs, { data_type: 'condition', title: 'Hashimoto thyroiditis' }, { data_type: 'allergy', title: 'Penicillin' }],
    });
    expect(sel.block).toContain('Conditions on file: Hashimoto thyroiditis');
    expect(sel.block).toContain('Allergies: Penicillin');
  });
});

describe('fetchPersonalRows', () => {
  it('queries by the authenticated user id only, parameterised, paged and capped', async () => {
    const pages: Record<number, LabRow[]> = {
      0: Array.from({ length: 2 }, () => lab('Ferritin', '1', '2026-01-01')),
      2: Array.from({ length: 2 }, () => lab('Ferritin', '2', '2025-01-01')),
      4: [lab('Ferritin', '3', '2024-01-01')],
    };
    const query = vi.fn(async (text: string, params: unknown[]) => {
      if (text === PERSONAL_LAB_SQL) return pages[params[2] as number] ?? [];
      return docs;
    });
    const out = await fetchPersonalRows({ query }, 'user-A', { pageSize: 2, labCap: 10 });
    expect(out.labs).toHaveLength(5);
    expect(out.docs).toBe(docs);
    for (const [text, params] of query.mock.calls) {
      expect(text).toMatch(/WHERE user_id = \$1\b/);
      expect(text).not.toContain('user-A');
      expect(params[0]).toBe('user-A');
    }
    expect(PERSONAL_DOC_SQL).toMatch(/WHERE user_id = \$1\b/);
    // Three lab pages (last one short) + one documents query.
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('stops at the cap', async () => {
    const query = vi.fn(async (text: string, params: unknown[]) =>
      text === PERSONAL_LAB_SQL ? Array.from({ length: params[1] as number }, () => lab('Na', '1', '2026-01-01')) : []);
    const out = await fetchPersonalRows({ query }, 'u', { pageSize: 3, labCap: 7 });
    expect(out.labs).toHaveLength(7);
  });

  it('never mixes rows of two users', async () => {
    const db: Record<string, LabRow[]> = {
      alice: [lab('Ferritin', '12', '2024-01-01')],
      bob: [lab('Ferritin', '99', '2024-01-01')],
    };
    const query = vi.fn(async (text: string, params: unknown[]) =>
      text === PERSONAL_LAB_SQL ? (params[2] === 0 ? db[params[0] as string] : []) : []);
    const { labs: a, docs: d } = await fetchPersonalRows({ query }, 'alice');
    const block = selectPersonalContext({ question: 'ferritin', labs: a, docs: d, now }).block;
    expect(block).toContain('Ferritin: 12');
    expect(block).not.toContain('99');
  });
});
