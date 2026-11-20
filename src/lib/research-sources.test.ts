import { describe, it, expect } from 'vitest';
import {
  SOURCES_FOOTER_MARK,
  citedSources,
  linkCitations,
  splitSourcesFooter,
  stripSourcesFooter,
  type ChatSource,
} from './research-sources';
import {
  SOURCES_FOOTER_MARK as SERVER_MARK,
  formatSourcesFooter,
  RESEARCH_DISCLAIMER as SERVER_DISCLAIMER,
} from '../../api/_lib/research/library';
import { RESEARCH_DISCLAIMER } from './research-sources';

const SOURCES: ChatSource[] = [
  { n: 1, id: 'pmid-111', pmid: '111', title: 'Caffeine in pregnancy [review]', source: 'Cochrane Database of Systematic Reviews', year: 2015, evidenceLevel: 'systematic review', url: 'https://pubmed.ncbi.nlm.nih.gov/111/' },
  { n: 2, id: 'pmid-222', pmid: '222', title: 'Coffee and health', source: 'BMJ', year: 2017, evidenceLevel: 'systematic review', url: 'https://pubmed.ncbi.nlm.nih.gov/222/' },
  { n: 3, id: 'pmid-333', pmid: '333', title: 'Antenatal care', source: 'WHO', year: 2016, evidenceLevel: 'guideline', url: 'https://pubmed.ncbi.nlm.nih.gov/333/' },
];

describe('research sources (chat page)', () => {
  it('client and server agree on the footer marker and disclaimer', () => {
    expect(SOURCES_FOOTER_MARK).toBe(SERVER_MARK);
    expect(RESEARCH_DISCLAIMER).toBe(SERVER_DISCLAIMER);
  });

  it('round-trips the stored footer written by the server', () => {
    const answer = 'Moderate caffeine is fine [1]. WHO agrees [3].';
    const stored = answer + formatSourcesFooter(SOURCES as Parameters<typeof formatSourcesFooter>[0], answer);
    const { body, sources } = splitSourcesFooter(stored);
    expect(body).toBe(answer);
    expect(sources.map((s) => [s.n, s.pmid, s.year, s.source])).toEqual([
      [1, '111', 2015, 'Cochrane Database of Systematic Reviews'],
      [3, '333', 2016, 'WHO'],
    ]);
    expect(stripSourcesFooter(stored)).toBe(answer);
  });

  it('leaves messages without our footer untouched', () => {
    const t = 'Plain answer.\n\n---\n**Sources**\n- something the model wrote';
    expect(splitSourcesFooter(t)).toEqual({ body: t, sources: [] });
  });

  it('shows only cited sources and links the markers', () => {
    const text = 'Fine in moderation [2][3]. [7] is not a source.';
    const cited = citedSources(text, SOURCES);
    expect(cited.map((s) => s.n)).toEqual([2, 3]);
    const linked = linkCitations(text, cited);
    expect(linked).toContain('[[2]](https://pubmed.ncbi.nlm.nih.gov/222/)');
    expect(linked).toContain('[[3]](https://pubmed.ncbi.nlm.nih.gov/333/)');
    expect(linked).toContain('[7] is not');
  });
});
