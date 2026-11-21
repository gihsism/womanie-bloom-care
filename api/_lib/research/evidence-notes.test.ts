import { describe, it, expect } from 'vitest';
import { EVIDENCE_NOTES, evidenceNote, evidenceNotes, resolveTakeaway, summarySentences } from './evidence-notes';
import { getLibrary, type ResearchItem } from './library';

const ALARMING = /\b(death|deaths|die|died|dying|mortality|fatal|stillbirths?|kill|cancer|cancers|life-threatening)\b/i;

describe('EVIDENCE_NOTES picks', () => {
  const lib = getLibrary();
  const byPmid = new Map(lib.items.map((it) => [it.pmid, it]));
  const topics = new Set(lib.topics.map((t) => t.id));

  for (const [id, def] of Object.entries(EVIDENCE_NOTES)) {
    it(`${id}: topic exists, 1-2 picks, each resolves to a calm one-liner`, () => {
      expect(topics.has(def.topic)).toBe(true);
      expect(def.picks.length).toBeGreaterThanOrEqual(1);
      expect(def.picks.length).toBeLessThanOrEqual(2);
      for (const pick of def.picks) {
        const item = byPmid.get(pick.pmid);
        expect(item, `pmid ${pick.pmid} missing from the library`).toBeDefined();
        const text = resolveTakeaway(item!, pick.use);
        expect(text, `${id} ${pick.pmid} ${pick.use}`).toBeTruthy();
        expect(text!.length).toBeGreaterThan(30);
        expect(text!.length).toBeLessThanOrEqual(220);
        expect(text).not.toMatch(ALARMING);
        expect(text).toMatch(/[.!?)]$/);
        // A finding, not "This review looked at...".
        expect(text).not.toMatch(/^(this|these) (cochrane )?(review|guideline|study|trial)/i);
      }
      const note = evidenceNote(id)!;
      expect(note.items).toHaveLength(def.picks.length);
      for (const it of note.items) expect(it.url).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
    });
  }
});

describe('resolveTakeaway', () => {
  const item = {
    summary: 'This review looked at iron. Iron probably helps. The evidence was 2.5 times weaker.',
    keyPoints: [' First point. ', 'Second point.'],
  };
  it('reads summary sentences and key points by index', () => {
    expect(resolveTakeaway(item, 's1')).toBe('Iron probably helps.');
    expect(resolveTakeaway(item, 's2')).toBe('The evidence was 2.5 times weaker.');
    expect(resolveTakeaway(item, 'k0')).toBe('First point.');
  });
  it('returns null for bad references', () => {
    expect(resolveTakeaway(item, 's9')).toBeNull();
    expect(resolveTakeaway(item, 'x1')).toBeNull();
    expect(resolveTakeaway(item, '')).toBeNull();
  });
  it('does not split on decimals', () => {
    expect(summarySentences('It rose 0.6-1.8%. Then it stopped.')).toEqual(['It rose 0.6-1.8%.', 'Then it stopped.']);
  });
});

describe('evidenceNotes', () => {
  it('drops unknown ids and duplicates, caps at 8', () => {
    const ids = ['iron', 'nope', 'iron', '__proto__', 'constructor', ...Object.keys(EVIDENCE_NOTES)];
    const notes = evidenceNotes(ids);
    expect(notes.length).toBeLessThanOrEqual(8);
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
    expect(notes.map((n) => n.id)).not.toContain('nope');
    expect(notes.map((n) => n.id)).not.toContain('__proto__');
    expect(notes[0].id).toBe('iron');
  });

  it('skips picks whose item left the library', () => {
    const fixture: ResearchItem[] = getLibrary().items.filter((it) => it.pmid === '42747316');
    const note = evidenceNote('iron', fixture)!;
    expect(note.items.map((i) => i.id)).toEqual(['pmid-42747316']);
  });

  it('returns only the fields the card needs (no full summaries)', () => {
    const [note] = evidenceNotes(['pre-eclampsia']);
    expect(Object.keys(note.items[0]).sort()).toEqual(['evidenceLevel', 'id', 'source', 'takeaway', 'title', 'url', 'year']);
  });
});
