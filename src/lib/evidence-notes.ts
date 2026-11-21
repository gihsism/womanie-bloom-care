// Client loader for "What the research says" notes.
//
// Notes start collapsed, so nothing is fetched until someone opens one.
// The first open fetches that note together with every other note
// currently mounted on the screen in ONE small request
// (GET /api/research/library?notes=a,b,c); the answers are cached for
// the session, so opening the next note on the screen is instant.

import type { EvidenceLevel } from './research-library';

export interface EvidenceNoteItem {
  id: string;
  title: string;
  source: string;
  year: number;
  evidenceLevel: EvidenceLevel;
  url: string;
  takeaway: string;
}

export interface EvidenceNoteData {
  id: string;
  topic: string;
  items: EvidenceNoteItem[];
}

const cache = new Map<string, Promise<EvidenceNoteData | null>>();
const mounted = new Map<string, number>();

/** Called by each EvidenceNote while it is on screen. Returns the cleanup. */
export function registerEvidenceNote(id: string): () => void {
  mounted.set(id, (mounted.get(id) ?? 0) + 1);
  return () => {
    const n = (mounted.get(id) ?? 1) - 1;
    if (n <= 0) mounted.delete(id);
    else mounted.set(id, n);
  };
}

/** Ids one request should carry: the asked-for note plus uncached mounted ones. */
export function idsToFetch(id: string, onScreen: Iterable<string>, cached: (id: string) => boolean): string[] {
  const ids = new Set([id]);
  for (const other of onScreen) if (!cached(other)) ids.add(other);
  return [...ids].sort().slice(0, 8);
}

/** One note by id (batched with the screen's other notes, cached). Null when unavailable. */
export function loadEvidenceNote(id: string): Promise<EvidenceNoteData | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const ids = idsToFetch(id, mounted.keys(), (x) => cache.has(x));
  if (!ids.includes(id)) ids[ids.length - 1] = id;
  const request = fetch(`/api/research/library?notes=${encodeURIComponent(ids.join(','))}`)
    .then(async (res) => (res.ok ? (((await res.json()) as { notes?: EvidenceNoteData[] }).notes ?? []) : []))
    .catch(() => [] as EvidenceNoteData[]);
  for (const x of ids) {
    const p = request.then((notes) => notes.find((n) => n.id === x) ?? null);
    cache.set(x, p);
    // A failed or empty answer may retry on the next open.
    void p.then((note) => { if (!note) cache.delete(x); });
  }
  return cache.get(id)!;
}

/** Some PubMed titles are ALL CAPS; show them in sentence case. */
export function readableTitle(title: string): string {
  const letters = title.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8 || letters !== letters.toUpperCase()) return title;
  const lower = title.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Test hook. */
export function _resetEvidenceNotes() {
  cache.clear();
  mounted.clear();
}
