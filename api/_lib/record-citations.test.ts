import { describe, it, expect } from 'vitest';
import { recordHref, recordsUsedInAnswer, sanitizeRecordRefs, type RecordCandidate } from './record-citations';
import { selectPersonalContext, type DocRow, type LabRow } from './personal-retrieval';

const now = new Date('2026-11-25T12:00:00Z');
const lab = (id: string, title: string, value: string, date: string, extra: Partial<LabRow> = {}): LabRow => ({
  id, data_type: 'lab_result', title, value, unit: 'ng/mL', reference_range: '', status: 'normal', date_recorded: date, notes: '', ...extra,
});

const labs: LabRow[] = [
  lab('l1', 'Ferritin', '9', '2022-03-01', { status: 'low', document_id: 'docA' }),
  lab('l2', 'Ferritin', '41', '2026-06-01', { document_id: 'docB' }),
  lab('l3', 'TSH', '6.8', '2026-09-01', { status: 'high', unit: 'mIU/L', document_id: 'docC' }),
  lab('l4', 'ALT', '22', '2026-08-01', { unit: 'U/L', document_id: 'docC' }),
];
const docs: DocRow[] = [
  { id: 'docA', ai_suggested_name: 'Iron panel 2022', ai_summary: 'Low ferritin.', ai_suggested_category: 'lab', uploaded_at: '2022-03-02' },
  { id: 'docU', ai_suggested_name: 'Pelvic ultrasound', ai_summary: 'Normal uterus.', ai_suggested_category: 'imaging', uploaded_at: '2026-04-01' },
];

describe('personal retrieval -> citation candidates', () => {
  const sel = selectPersonalContext({ question: 'How has my ferritin changed?', labs, docs, now });

  it('lists what the model was shown, with row ids, but never puts ids in the prompt', () => {
    const ferritin = sel.candidates.find((c) => c.label === 'Ferritin')!;
    expect(ferritin).toMatchObject({ kind: 'lab', id: 'l2', documentId: 'docB', date: '2026-06-01', count: 2 });
    expect(sel.candidates.find((c) => c.label === 'TSH')).toMatchObject({ id: 'l3', documentId: 'docC' });
    expect(sel.candidates.find((c) => c.kind === 'document')).toMatchObject({ id: 'docA', label: 'Iron panel 2022' });
    for (const id of ['l1', 'l2', 'l3', 'docA', 'docB']) expect(sel.block).not.toContain(id);
  });

  it('baseline rows (not asked about) need their value quoted to count', () => {
    expect(sel.candidates.find((c) => c.label === 'ALT')?.requireValue).toEqual(['22']);
  });

  it('rows without ids give no candidates (old rows / tests)', () => {
    const noIds = selectPersonalContext({ question: 'ferritin', labs: labs.map(({ id: _id, ...r }) => r), docs: [], now });
    expect(noIds.candidates).toEqual([]);
  });
});

describe('recordsUsedInAnswer', () => {
  const { candidates } = selectPersonalContext({ question: 'How has my ferritin changed?', labs, docs, now });

  it('an answer about her ferritin cites the ferritin record, linked to its report', () => {
    const refs = recordsUsedInAnswer('Your ferritin rose from 9 to 41 ng/mL, which is reassuring.', candidates);
    expect(refs).toEqual([
      { kind: 'lab', id: 'l2', label: 'Ferritin', date: '2026-06-01', href: '/dashboard/medical-history?doc=docB', count: 2 },
    ]);
  });

  it('a document named in the answer gets its own chip', () => {
    const refs = recordsUsedInAnswer('Your iron panel from 2022 showed low ferritin.', candidates);
    expect(refs.map((r) => r.id)).toEqual(['l2', 'docA']);
    expect(refs[1].href).toBe('/dashboard/medical-history?doc=docA');
  });

  it('an answer that uses none of her records has no chips', () => {
    expect(recordsUsedInAnswer('Iron-rich foods include lentils and spinach.', candidates)).toEqual([]);
    expect(recordsUsedInAnswer('', candidates)).toEqual([]);
    expect(recordsUsedInAnswer('Your ferritin is fine', [])).toEqual([]);
  });

  it('a baseline test mentioned in passing is not a citation; quoting her value is', () => {
    expect(recordsUsedInAnswer('ALT is a liver enzyme.', candidates).map((r) => r.label)).toEqual([]);
    expect(recordsUsedInAnswer('Your ALT of 22 U/L is normal.', candidates).map((r) => r.label)).toEqual(['ALT']);
  });

  it('caps at 4 chips and never repeats one', () => {
    const many: RecordCandidate[] = Array.from({ length: 8 }, (_, i) => ({
      kind: 'lab', id: `x${i}`, documentId: null, label: `Test${i}`, date: null, terms: ['ferritin'],
    }));
    many.push({ ...many[0] });
    const refs = recordsUsedInAnswer('your ferritin', many);
    expect(refs).toHaveLength(4);
    expect(new Set(refs.map((r) => r.id)).size).toBe(4);
    expect(refs[0].href).toBe('/dashboard/medical-history');
  });

  it('word boundaries: "Ferritinase" or "salt" do not cite Ferritin / ALT', () => {
    const c: RecordCandidate[] = [
      { kind: 'lab', id: 'a', documentId: null, label: 'ALT', date: null, terms: ['alt'] },
      { kind: 'lab', id: 'f', documentId: null, label: 'Ferritin', date: null, terms: ['ferritin'] },
    ];
    expect(recordsUsedInAnswer('Less salt and ferritinase.', c)).toEqual([]);
  });
});

describe('recordHref / sanitizeRecordRefs', () => {
  it('links into Records only', () => {
    expect(recordHref('a b')).toBe('/dashboard/medical-history?doc=a%20b');
    expect(recordHref(null)).toBe('/dashboard/medical-history');
  });

  it('keeps well-formed refs, drops anything else (off-site links, bad kinds)', () => {
    const ok = { kind: 'lab', id: 'l2', label: 'Ferritin', date: '2026-06-01', href: '/dashboard/medical-history?doc=docB', count: 2 };
    expect(sanitizeRecordRefs([ok])).toEqual([ok]);
    expect(sanitizeRecordRefs([
      { ...ok, href: 'https://evil.example' },
      { ...ok, href: 'javascript:alert(1)' },
      { ...ok, kind: 'note' },
      { ...ok, id: 5 },
      null,
      'x',
    ])).toEqual([]);
    expect(sanitizeRecordRefs('nope')).toEqual([]);
    expect(sanitizeRecordRefs([{ ...ok, date: 'yesterday' }])[0].date).toBeNull();
  });
});
