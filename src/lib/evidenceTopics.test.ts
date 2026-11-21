import { describe, it, expect } from 'vitest';
import {
  allEvidenceRules,
  evidenceSpec,
  labMarker,
  libraryLink,
  medicineMarker,
  specsForLabs,
  specsForMarkers,
} from './evidenceTopics';
import { EVIDENCE_NOTES, evidenceNote } from '../../api/_lib/research/evidence-notes';
import { getLibrary } from '../../api/_lib/research/library';

describe('labMarker: common report spellings', () => {
  it.each([
    ['Ferritin', 'iron'],
    ['Serum ferritin', 'iron'],
    ['S-Ferritin', 'iron'],
    ['Iron', 'iron'],
    ['Hemoglobin', 'iron'],
    ['Haemoglobin (Hb)', 'iron'],
    ['HGB', 'iron'],
    ['Transferrin saturation', 'iron'],
    ['Vitamin D 25-OH', 'vitamin-d'],
    ['25-OH Vitamin D', 'vitamin-d'],
    ['25(OH)D', 'vitamin-d'],
    ['Vitamin D3', 'vitamin-d'],
    ['Vit. D', 'vitamin-d'],
    ['Calcidiol', 'vitamin-d'],
    ['TSH', 'thyroid'],
    ['TSH basal', 'thyroid'],
    ['Free T4', 'thyroid'],
    ['fT4', 'thyroid'],
    ['Anti-TPO', 'thyroid'],
    ['AMH', 'amh'],
    ['Anti-Müllerian hormone', 'amh'],
    ['Anti-Mullerian Hormone (AMH)', 'amh'],
    ['HbA1c', 'glucose'],
    ['Hb A1c', 'glucose'],
    ['A1C', 'glucose'],
    ['Glycated haemoglobin', 'glucose'],
    ['Fasting glucose', 'glucose'],
    ['OGTT 2h', 'glucose'],
    ['Vitamin B12', 'b12'],
    ['B12 (cobalamin)', 'b12'],
    ['Holotranscobalamin', 'b12'],
    ['Folate', 'folate'],
    ['Folic acid', 'folate'],
    ['Progesterone', 'progesterone'],
    ['Testosterone, total', 'androgens'],
    ['DHEA-S', 'androgens'],
    ['LDL cholesterol', 'lipids'],
    ['Triglycerides', 'lipids'],
    ['Calcium', 'calcium'],
  ])('%s -> %s', (name, marker) => {
    expect(labMarker(name)).toBe(marker);
  });

  it('HbA1c is blood sugar, not haemoglobin', () => {
    expect(labMarker('HbA1c')).toBe('glucose');
    expect(labMarker('HBA1C %')).toBe('glucose');
  });

  it('returns null for tests with no note, and for empty input', () => {
    for (const name of ['LH', 'Estradiol', 'Platelets', 'CRP', 'Prolactin', 'hCG', 'Vitamin C', 'FSH', '', null, undefined]) {
      expect(labMarker(name as string)).toBeNull();
    }
  });

  it('does not match short codes inside longer words', () => {
    expect(labMarker('Chloride')).toBeNull();
    expect(labMarker('Vitamin Deficiency screen')).toBeNull();
  });
});

describe('medicineMarker', () => {
  it.each([
    ['HRT', 'hrt'],
    ['Oestrogel', 'hrt'],
    ['Estradiol patch', 'hrt'],
    ['Utrogestan 100mg', 'hrt'],
    ['Folic acid', 'folate'],
    ['Iron', 'iron'],
    ['Ferrous sulfate', 'iron'],
    ['Vitamin D', 'vitamin-d'],
    ['Vitamin D3 1000 IU', 'vitamin-d'],
    ['Levothyroxine', 'thyroid'],
    ['Calcium', 'calcium'],
  ])('%s -> %s', (name, marker) => {
    expect(medicineMarker(name)).toBe(marker);
  });

  it('ignores medicines with no note', () => {
    for (const name of ['Ibuprofen', 'Prenatal vitamin', 'Magnesium', 'Contraceptive pill', 'Painkiller']) {
      expect(medicineMarker(name)).toBeNull();
    }
  });
});

describe('evidenceSpec: marker + mode -> note', () => {
  it('picks the stage-specific note', () => {
    expect(evidenceSpec('iron', 'pregnancy')?.note).toBe('iron-pregnancy');
    expect(evidenceSpec('iron', 'postpartum')?.note).toBe('iron-postpartum');
    expect(evidenceSpec('iron', 'menstrual-cycle')?.note).toBe('iron');
    expect(evidenceSpec('iron', null)?.note).toBe('iron');
    expect(evidenceSpec('vitamin-d', 'pregnancy')?.note).toBe('vitamin-d-pregnancy');
    expect(evidenceSpec('vitamin-d', 'post-menopause')?.note).toBe('bone-menopause');
    expect(evidenceSpec('thyroid', 'ivf')?.note).toBe('thyroid-fertility');
    expect(evidenceSpec('blood-pressure', 'pregnancy')?.note).toBe('pre-eclampsia');
    expect(evidenceSpec('lipids', 'menopause')?.note).toBe('heart-menopause');
    expect(evidenceSpec('epds', 'postpartum')?.note).toBe('mood-postpartum');
    expect(evidenceSpec('epds', 'pregnancy')?.note).toBe('mood-pregnancy');
  });

  it('maps app mode aliases to library stages', () => {
    expect(evidenceSpec('folate', 'trying-to-conceive')?.stage).toBe('conception');
    expect(evidenceSpec('hot-flushes', 'perimenopause')?.note).toBe('hot-flushes');
  });

  it('shows no note where the library has nothing on point', () => {
    expect(evidenceSpec('glucose', 'menstrual-cycle')).toBeNull();
    expect(evidenceSpec('thyroid', 'menopause')).toBeNull();
    expect(evidenceSpec('progesterone', 'menstrual-cycle')).toBeNull();
    expect(evidenceSpec('blood-pressure', 'postpartum')).toBeNull();
    expect(evidenceSpec('blood-pressure', 'menopause')).toBeNull();
    expect(evidenceSpec('hrt', 'pregnancy')).toBeNull();
    expect(evidenceSpec(null, 'pregnancy')).toBeNull();
  });
});

describe('specsForLabs / specsForMarkers', () => {
  it('puts flagged results first, max 2, no duplicates', () => {
    const specs = specsForLabs(
      [
        { title: 'Vitamin D 25-OH', status: 'normal' },
        { title: 'Hemoglobin', status: 'normal' },
        { title: 'Ferritin', status: 'abnormal' },
        { title: 'TSH', status: 'normal' },
      ],
      'pregnancy',
    );
    expect(specs.map((s) => s.note)).toEqual(['iron-pregnancy', 'vitamin-d-pregnancy']);
  });

  it('falls back to the card label when the report title is unknown', () => {
    expect(specsForLabs([{ title: 'S-Ferr', label: 'Iron Stores' }], 'menstrual-cycle').map((s) => s.note)).toEqual(['iron']);
  });

  it('skips markers with no note for the stage', () => {
    expect(specsForMarkers(['glucose', 'b12'], 'menopause').map((s) => s.note)).toEqual(['b12']);
    expect(specsForMarkers([null, undefined], 'menopause')).toEqual([]);
  });
});

describe('libraryLink', () => {
  it('deep-links to the stage + topic', () => {
    expect(libraryLink({ topic: 'pre-eclampsia', stage: 'pregnancy' })).toBe('/library?stage=pregnancy&topic=pre-eclampsia');
    expect(libraryLink({ topic: 'vitamin-b12', stage: null })).toBe('/library?stage=all&topic=vitamin-b12');
  });
});

describe('client rules match the server notes', () => {
  const topics = new Set(getLibrary().topics.map((t) => t.id));
  it.each(allEvidenceRules().map((r) => [r.marker, r.note, r.topic]))('%s -> %s (%s)', (_m, note, topic) => {
    expect(EVIDENCE_NOTES[note]).toBeDefined();
    expect(EVIDENCE_NOTES[note].topic).toBe(topic);
    expect(topics.has(topic)).toBe(true);
    expect(evidenceNote(note)!.items.length).toBeGreaterThan(0);
  });

  it('every server note is used by some rule', () => {
    const used = new Set(allEvidenceRules().map((r) => r.note));
    expect(Object.keys(EVIDENCE_NOTES).filter((id) => !used.has(id))).toEqual([]);
  });
});
