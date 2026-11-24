// "Questions to bring", saved per upcoming visit (table visit_questions,
// migration 012). The patient owns the row; the doctor of that visit
// reads it read-only in the patient chart. Pure helpers, unit-tested.

export interface VisitQuestion {
  id: string;
  text: string;
  asked: boolean;
}

export const MAX_QUESTIONS = 20;
export const MAX_QUESTION_CHARS = 300;

/** Parse the stored questions (JSONB may arrive parsed or as a string); drops junk. */
export function parseQuestions(raw: unknown): VisitQuestion[] {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  const out: VisitQuestion[] = [];
  const seen = new Set<string>();
  for (const q of v) {
    if (!q || typeof q !== 'object') continue;
    const { id, text, asked } = q as Record<string, unknown>;
    if (typeof text !== 'string' || !text.trim()) continue;
    const key = typeof id === 'string' && id ? id : `q:${text.trim().slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: key, text: text.trim().slice(0, MAX_QUESTION_CHARS), asked: asked === true });
  }
  return out.slice(0, MAX_QUESTIONS);
}

/** The suggested list as first saved: keeps the ticks she made before saving. */
export function fromSuggestions(
  suggestions: Array<{ id: string; text: string }>,
  checked: Record<string, boolean>,
): VisitQuestion[] {
  return suggestions.map(s => ({ id: s.id, text: s.text, asked: !!checked[s.id] })).slice(0, MAX_QUESTIONS);
}

/** Add her own question (trimmed, capped, no exact duplicates). */
export function addQuestion(list: VisitQuestion[], text: string, now = Date.now()): VisitQuestion[] {
  const t = text.trim().replace(/\s+/g, ' ').slice(0, MAX_QUESTION_CHARS);
  if (!t || list.length >= MAX_QUESTIONS) return list;
  if (list.some(q => q.text.toLowerCase() === t.toLowerCase())) return list;
  return [...list, { id: `own:${now.toString(36)}`, text: t, asked: false }];
}

export const toggleAsked = (list: VisitQuestion[], id: string): VisitQuestion[] =>
  list.map(q => (q.id === id ? { ...q, asked: !q.asked } : q));

export const removeQuestion = (list: VisitQuestion[], id: string): VisitQuestion[] => list.filter(q => q.id !== id);

/** "today", "tomorrow" or "in N days", in calendar days (a visit tomorrow morning is not "0 days away"). */
export function visitDaysAway(when: Date, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = Math.round((day(when) - day(now)) / 86_400_000);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}
