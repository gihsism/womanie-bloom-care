// "What the research says" notes that sit next to the user's own data
// (lab results, blood pressure, EPDS, pregnancy weight, hot flushes,
// HRT...). Each note id names 1-2 hand-picked library items and the one
// sentence of their plain-English summary (s<n>) or key points (k<n>)
// that works as a calm, standalone takeaway.
//
// Hand-picked on purpose: topic tags alone pull in loosely related items
// (an AMH note once ranked a hysterectomy review first), and the first
// summary sentence usually describes the paper rather than what it found.
// Picks avoid mortality / worst-case wording; library.test checks every
// pick still resolves after a library rebuild.
//
// The client maps a lab test or tracker to a note id in
// src/lib/evidenceTopics.ts; keep the two in step (evidenceTopics.test).

import { getLibrary, type EvidenceLevel, type ResearchItem } from './library.js';

export interface EvidenceNoteDef {
  /** Library topic the note's "More in the library" link opens. */
  topic: string;
  picks: { pmid: string; use: string }[];
}

export const EVIDENCE_NOTES: Record<string, EvidenceNoteDef> = {
  'iron-pregnancy': {
    topic: 'anaemia-pregnancy',
    picks: [{ pmid: '41031541', use: 'k2' }, { pmid: '39145520', use: 's1' }],
  },
  'iron-postpartum': {
    topic: 'iron-deficiency',
    picks: [{ pmid: '39670550', use: 's1' }, { pmid: '34028001', use: 'k3' }],
  },
  iron: {
    topic: 'iron-deficiency',
    picks: [{ pmid: '42747316', use: 'k1' }, { pmid: '34028001', use: 's1' }],
  },
  'vitamin-d-pregnancy': {
    topic: 'vitamin-d-pregnancy',
    picks: [{ pmid: '39077939', use: 's2' }, { pmid: '38816412', use: 'k3' }],
  },
  'vitamin-d': {
    topic: 'vitamin-d',
    picks: [{ pmid: '28216084', use: 's1' }, { pmid: '38828931', use: 'k2' }],
  },
  'bone-menopause': {
    topic: 'bone-health',
    picks: [{ pmid: '40134107', use: 'k2' }, { pmid: '26420598', use: 's1' }],
  },
  'thyroid-pregnancy': {
    topic: 'thyroid-pregnancy',
    picks: [{ pmid: '42219800', use: 'k0' }, { pmid: '26387772', use: 's2' }],
  },
  'thyroid-fertility': {
    topic: 'thyroid-pregnancy',
    picks: [{ pmid: '42219800', use: 'k0' }, { pmid: '31236916', use: 's2' }],
  },
  amh: {
    topic: 'amh-ovarian-reserve',
    picks: [{ pmid: '36651193', use: 's1' }, { pmid: '37589624', use: 'k0' }],
  },
  'glucose-pregnancy': {
    topic: 'gestational-diabetes',
    picks: [{ pmid: '39481539', use: 's1' }, { pmid: '18463375', use: 's2' }],
  },
  b12: {
    topic: 'vitamin-b12',
    picks: [{ pmid: '29543316', use: 'k0' }],
  },
  folate: {
    topic: 'folic-acid',
    picks: [{ pmid: '35691683', use: 's1' }, { pmid: '26662928', use: 'k0' }],
  },
  'progesterone-ivf': {
    topic: 'luteal-support',
    picks: [{ pmid: '34384594', use: 's2' }],
  },
  androgens: {
    topic: 'pcos',
    picks: [{ pmid: '29794677', use: 'k0' }, { pmid: '30921477', use: 'k0' }],
  },
  'heart-menopause': {
    topic: 'menopause-weight-heart',
    picks: [{ pmid: '33155924', use: 'k0' }],
  },
  'pre-eclampsia': {
    topic: 'pre-eclampsia',
    picks: [{ pmid: '30575675', use: 'k0' }, { pmid: '28657417', use: 's2' }],
  },
  'mood-pregnancy': {
    topic: 'perinatal-mental-health-pregnancy',
    picks: [{ pmid: '30629567', use: 'k0' }, { pmid: '40566968', use: 'k1' }],
  },
  'mood-postpartum': {
    topic: 'postnatal-depression',
    picks: [{ pmid: '30629567', use: 'k0' }, { pmid: '40566968', use: 'k2' }],
  },
  'weight-gain-pregnancy': {
    topic: 'weight-gain-pregnancy',
    picks: [{ pmid: '30297272', use: 'k0' }, { pmid: '26068707', use: 'k0' }],
  },
  'hot-flushes': {
    topic: 'hot-flushes',
    picks: [{ pmid: '26444994', use: 'k0' }, { pmid: '38336466', use: 'k3' }],
  },
  hrt: {
    topic: 'hrt-benefits-risks',
    picks: [{ pmid: '26444994', use: 'k1' }, { pmid: '28703650', use: 'k1' }],
  },
  'cycle-timing': {
    topic: 'cycle-tracking',
    picks: [{ pmid: '37709293', use: 's1' }],
  },
};

export interface EvidenceNoteItem {
  id: string;
  title: string;
  source: string;
  year: number;
  evidenceLevel: EvidenceLevel;
  url: string;
  /** One calm sentence from the item's own summary or key points. */
  takeaway: string;
}

export interface EvidenceNote {
  id: string;
  topic: string;
  items: EvidenceNoteItem[];
}

export function summarySentences(summary: string): string[] {
  return summary.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
}

/** Resolves a pick reference ('s2' = summary sentence 3, 'k0' = first key point). */
export function resolveTakeaway(item: Pick<ResearchItem, 'summary' | 'keyPoints'>, use: string): string | null {
  const m = /^([sk])(\d+)$/.exec(use);
  if (!m) return null;
  const list = m[1] === 's' ? summarySentences(item.summary) : item.keyPoints.map((k) => k.trim());
  return list[Number(m[2])] ?? null;
}

/** One note by id, or null for an unknown id. Items that vanished from the library are skipped. */
export function evidenceNote(id: string, items?: ResearchItem[]): EvidenceNote | null {
  const def = Object.prototype.hasOwnProperty.call(EVIDENCE_NOTES, id) ? EVIDENCE_NOTES[id] : undefined;
  if (!def) return null;
  const all = items ?? getLibrary().items;
  const byPmid = new Map(all.map((it) => [it.pmid, it]));
  const out: EvidenceNoteItem[] = [];
  for (const pick of def.picks) {
    const it = byPmid.get(pick.pmid);
    const takeaway = it ? resolveTakeaway(it, pick.use) : null;
    if (!it || !takeaway) continue;
    out.push({
      id: it.id,
      title: it.title,
      source: it.source,
      year: it.year,
      evidenceLevel: it.evidenceLevel,
      url: it.url,
      takeaway,
    });
  }
  return { id, topic: def.topic, items: out };
}

/** Notes for a comma-separated id list (max 8, unknown ids dropped). */
export function evidenceNotes(ids: string[], items?: ResearchItem[]): EvidenceNote[] {
  const uniq = [...new Set(ids.map((s) => s.trim()).filter(Boolean))].slice(0, 8);
  return uniq.map((id) => evidenceNote(id, items)).filter((n): n is EvidenceNote => n !== null);
}
