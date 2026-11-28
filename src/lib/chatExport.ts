// Ask AI: one chat as a Markdown file / a printable page, and one answer
// as a question for her next visit ("Ask my doctor about this").
// Pure helpers, unit-tested; the page does the saving.

import { formatDateTime } from '@/lib/dateFormat';
import { addQuestion, parseQuestions, MAX_QUESTION_CHARS, type VisitQuestion } from './visitQuestions';
import { citedSources, splitSourcesFooter, stripUnknownCitations, type ChatSource } from './research-sources';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

export interface PrintTurn {
  role: 'user' | 'assistant';
  /** Answer text without the stored sources footer or dangling [n] markers. */
  body: string;
  /** The research sources this answer cites (by its [n] markers). */
  sources: ChatSource[];
}

/** The turns worth printing: non-empty, answers cleaned of their sources footer. */
export function chatPrintTurns(turns: ChatTurn[]): PrintTurn[] {
  return turns
    .filter(t => t.content?.trim())
    .map(t => {
      if (t.role === 'user') return { role: 'user' as const, body: t.content.trim(), sources: [] };
      const { body: raw, sources } = t.sources ? { body: t.content, sources: t.sources } : splitSourcesFooter(t.content);
      const body = stripUnknownCitations(raw, sources.map(s => s.n)).trim();
      return { role: 'assistant' as const, body, sources: citedSources(body, sources) };
    });
}

/** One chat as Markdown (the "Export this chat" file). */
export function chatToMarkdown(turns: ChatTurn[], opts: { exportedAt: Date; model?: string | null }): string {
  const header = [
    '# Womanie AI Health Assistant',
    '',
    `Exported: ${formatDateTime(opts.exportedAt)}`,
    ...(opts.model ? [`Model: ${opts.model}`] : []),
    '',
    '> This conversation is for reference only. The AI assistant on Womanie is not a substitute for medical advice from a licensed clinician.',
    '',
    '---',
    '',
  ].join('\n');
  const body = chatPrintTurns(turns)
    .map(t => {
      const role = t.role === 'user' ? '## You' : '## Assistant';
      const src = t.sources.length
        ? `\nSources:\n${t.sources.map(s => `[${s.n}] ${s.title} (${s.source}${s.year ? `, ${s.year}` : ''})${s.url ? ` ${s.url}` : ''}`).join('\n')}\n`
        : '';
      return `${role}\n\n${t.body}\n${src}`;
    })
    .join('\n---\n\n');
  return header + body;
}

const plain = (md: string) =>
  md
    .replace(/\s*\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?!\()/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const cap = (t: string) => (t.length > MAX_QUESTION_CHARS ? `${t.slice(0, MAX_QUESTION_CHARS - 1).trimEnd()}…` : t);

/**
 * The question to bring for the answer at `idx`: her own question that
 * the answer replied to; without one, the answer's first sentence.
 * Null when there is nothing to save.
 */
export function questionFromAnswer(turns: ChatTurn[], idx: number): string | null {
  const answer = turns[idx];
  if (!answer || answer.role !== 'assistant') return null;
  for (let i = idx - 1; i >= 0; i--) {
    if (turns[i].role === 'user') {
      const q = plain(turns[i].content);
      if (q) return cap(q);
      break;
    }
  }
  const first = plain(splitSourcesFooter(answer.content).body).split(/(?<=[.!?])\s/)[0];
  return first ? cap(first) : null;
}

/**
 * Add one question to a visit's list. When the visit has no list yet, her
 * open questions saved before any visit was booked come along first (as
 * the Visits card does on its first save); `carried` says so.
 */
export function addToVisitList(
  visitRaw: unknown | null,
  unscheduledRaw: unknown | null,
  text: string,
  now = Date.now(),
): { list: VisitQuestion[]; added: boolean; carried: boolean } {
  const isNew = visitRaw == null;
  const base = isNew ? parseQuestions(unscheduledRaw).filter(q => !q.asked) : parseQuestions(visitRaw);
  const list = addQuestion(base, text, now);
  return { list, added: list !== base, carried: isNew && base.length > 0 };
}
