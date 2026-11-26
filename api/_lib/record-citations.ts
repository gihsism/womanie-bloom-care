// "From your records" chips under an Ask AI answer.
//
// The personal-retrieval step (./personal-retrieval.ts) knows which of her
// rows it put in the prompt. It hands them here as candidates; after the
// answer is written, only the candidates the answer actually talks about
// become chips, each linking to the document it came from. The chips
// travel as structured metadata on the stream (never in the prose), and
// carry only her own row ids, a label and a date: no values.
//
// Deterministic, no model call.

export type RecordKind = 'lab' | 'document';

export interface RecordCandidate {
  kind: RecordKind;
  /** Row id (medical_extracted_data.id or health_documents.id). */
  id: string;
  /** Document the row came from (labs), or the document itself. */
  documentId: string | null;
  /** Chip text: the test name or the document name. */
  label: string;
  /** YYYY-MM-DD: latest reading (labs) or upload date (documents). */
  date: string | null;
  /** Words that show the answer is about this record. */
  terms: string[];
  /** Number of readings on file (labs). */
  count?: number;
  /**
   * Baseline rows were not asked about: a passing mention ("ALT is a
   * liver test") is not use of her record, so the answer must also quote
   * one of these value strings.
   */
  requireValue?: string[];
}

export interface RecordRef {
  kind: RecordKind;
  id: string;
  label: string;
  date: string | null;
  /** In-app link: the source document in Records, or Records itself. */
  href: string;
  count?: number;
}

export const MAX_RECORD_REFS = 4;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentions(text: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return false;
  // Cyrillic is inflected: prefix match for longer stems, as in retrieval.
  const tail = /\p{Script=Cyrillic}/u.test(t) && t.length >= 5 ? '' : '(?=$|[^\\p{L}\\p{N}])';
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(t)}${tail}`, 'u').test(text);
}

function quotesValue(text: string, value: string): boolean {
  const v = value.trim();
  if (!/\d/.test(v)) return false;
  return new RegExp(`(^|[^\\d.,])${esc(v)}(?![\\d])`).test(text);
}

export function recordHref(documentId: string | null): string {
  return documentId
    ? `/dashboard/medical-history?doc=${encodeURIComponent(documentId)}`
    : '/dashboard/medical-history';
}

/**
 * The candidates the answer uses, as chips: tests first (in the order the
 * prompt listed them), then documents the answer names; one chip per
 * record, at most 4.
 */
export function recordsUsedInAnswer(answer: string, candidates: RecordCandidate[], max = MAX_RECORD_REFS): RecordRef[] {
  if (!answer || !Array.isArray(candidates) || candidates.length === 0) return [];
  const text = answer.toLowerCase();
  const usedLabs = candidates.filter((c) => c.kind === 'lab'
    && c.terms.some((t) => mentions(text, t))
    && (!c.requireValue?.length || c.requireValue.some((v) => quotesValue(answer, v))));
  const usedDocs = candidates.filter((c) => c.kind === 'document' && c.terms.some((t) => mentions(text, t)));

  const out: RecordRef[] = [];
  const seen = new Set<string>();
  for (const c of [...usedLabs, ...usedDocs]) {
    const key = `${c.kind}:${c.kind === 'lab' ? c.label.toLowerCase() : c.id}`;
    if (seen.has(key) || !c.id) continue;
    seen.add(key);
    out.push({
      kind: c.kind,
      id: c.id,
      label: c.label.slice(0, 60),
      date: c.date,
      href: recordHref(c.kind === 'document' ? c.id : c.documentId),
      ...(c.count ? { count: c.count } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Shape check for record refs arriving on the stream (the page side). */
export function sanitizeRecordRefs(value: unknown): RecordRef[] {
  if (!Array.isArray(value)) return [];
  const out: RecordRef[] = [];
  for (const v of value.slice(0, MAX_RECORD_REFS)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    if ((r.kind !== 'lab' && r.kind !== 'document') || typeof r.id !== 'string' || typeof r.label !== 'string') continue;
    // Only in-app Records links; anything else is dropped.
    const href = typeof r.href === 'string' && /^\/dashboard\/medical-history(\?doc=[\w%.-]+)?$/.test(r.href) ? r.href : null;
    if (!href) continue;
    out.push({
      kind: r.kind,
      id: r.id,
      label: r.label.slice(0, 60),
      date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
      href,
      ...(typeof r.count === 'number' && r.count > 0 ? { count: Math.floor(r.count) } : {}),
    });
  }
  return out;
}
