// Client side of the AI chat's research sources.
//
// The chat API sends the numbered sources it gave the model as the first
// SSE event ({ sources: [...] }) and stores the cited ones as a markdown
// footer on the saved message (see api/_lib/research/library.ts,
// formatSourcesFooter). These helpers turn either form into the compact
// Sources list under an answer.

export type EvidenceLevel = 'guideline' | 'systematic review' | 'study';

export interface ChatSource {
  n: number;
  id: string;
  pmid: string;
  title: string;
  source: string;
  year: number;
  /** Present on live replies; not stored in the saved footer. */
  evidenceLevel?: EvidenceLevel;
  url: string;
  /** Licence of the open-access full text the AI also read, e.g. "CC BY". */
  fulltext?: string;
}

/** Must match SOURCES_FOOTER_MARK in api/_lib/research/library.ts. */
export const SOURCES_FOOTER_MARK = '\n\n---\n**Sources**\n';

export const RESEARCH_DISCLAIMER =
  'General information from published research, not medical advice. Talk to your doctor or midwife about your situation.';

// PubMed links carry the PMID; an official non-PubMed source (e.g. BAG, BLV,
// SGGG) has any https link and no PMID.
const FOOTER_LINE = /^- \[(\d+)\] \[(.+)\]\((https:\/\/[^\s()]+)\) — (.+), (\d{4})(?: · Full text, (.+))?$/;
const PUBMED_URL = /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/$/;

/** Splits a stored assistant message into its text and its saved sources. */
export function splitSourcesFooter(content: string): { body: string; sources: ChatSource[] } {
  const at = content.lastIndexOf(SOURCES_FOOTER_MARK);
  if (at < 0) return { body: content, sources: [] };
  const sources: ChatSource[] = [];
  for (const line of content.slice(at + SOURCES_FOOTER_MARK.length).split('\n')) {
    const m = line.trim().match(FOOTER_LINE);
    if (!m) continue;
    const pmid = m[3].match(PUBMED_URL)?.[1] ?? '';
    sources.push({
      n: Number(m[1]),
      id: pmid ? `pmid-${pmid}` : m[3],
      pmid,
      title: m[2],
      source: m[4],
      year: Number(m[5]),
      url: m[3],
      ...(m[6] ? { fulltext: m[6] } : {}),
    });
  }
  // Not our footer after all (e.g. the model wrote one): leave text alone.
  if (sources.length === 0) return { body: content, sources: [] };
  return { body: content.slice(0, at), sources };
}

export function stripSourcesFooter(content: string): string {
  return splitSourcesFooter(content).body;
}

/** Numbers like [2], [1][3] or [1, 3] cited in the text (1..max). */
export function citedNumbers(text: string, max: number): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g)) {
    for (const n of m[1].split(',').map((x) => Number(x.trim()))) if (n >= 1 && n <= max) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Removes citation markers whose number is not one of the given sources
 * ([7] when only [1]-[3] exist), keeping valid numbers inside a group
 * ([1, 7] -> [1]). Must match stripUnknownCitations on the server.
 */
export function stripUnknownCitations(text: string, valid: readonly number[]): string {
  const ok = new Set(valid);
  return text.replace(/([ \t]*)\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?!\()/g, (_whole, ws: string, list: string) => {
    const keep = list.split(',').map((x) => Number(x.trim())).filter((n) => ok.has(n));
    return keep.length === 0 ? '' : `${ws}[${keep.join(', ')}]`;
  });
}

/** Only the sources the answer actually cites, in number order. */
export function citedSources(text: string, sources: ChatSource[]): ChatSource[] {
  const max = Math.max(0, ...sources.map((s) => s.n));
  const cited = new Set(citedNumbers(text, max));
  return sources.filter((s) => cited.has(s.n)).sort((a, b) => a.n - b.n);
}

/** Turns [n] markers into markdown links to the source (for ReactMarkdown). */
export function linkCitations(text: string, sources: ChatSource[]): string {
  if (sources.length === 0) return text;
  const byN = new Map(sources.map((s) => [s.n, s.url]));
  return text.replace(/\[(\d{1,2})\](?!\()/g, (whole, d: string) => {
    const url = byN.get(Number(d));
    return url ? `[[${d}]](${url})` : whole;
  });
}
