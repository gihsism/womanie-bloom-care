import { describe, it, expect } from 'vitest';
import {
  SOURCES_FOOTER_MARK,
  citedSources,
  linkCitations,
  splitSourcesFooter,
  stripSourcesFooter,
  stripUnknownCitations,
  type ChatSource,
} from './research-sources';
import {
  SOURCES_FOOTER_MARK as SERVER_MARK,
  formatSourcesFooter,
  stripUnknownCitations as serverStripUnknownCitations,
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

  it('keeps an official non-PubMed source (e.g. BAG) in the stored footer', () => {
    const swiss = { n: 1, id: 'gp-bag-x', pmid: '', title: 'Maternity benefits', source: 'BAG', year: 2026, evidenceLevel: 'guideline' as const, url: 'https://www.bag.admin.ch/de/krankenversicherung-leistungen-bei-mutterschaft' };
    const answer = 'Basic insurance covers two scans [1]. Caffeine is fine [2].';
    const stored = answer + formatSourcesFooter([swiss, { ...SOURCES[0], n: 2 }] as Parameters<typeof formatSourcesFooter>[0], answer);
    const { sources } = splitSourcesFooter(stored);
    expect(sources.map((s) => [s.n, s.pmid, s.source, s.url])).toEqual([
      [1, '', 'BAG', swiss.url],
      [2, '111', 'Cochrane Database of Systematic Reviews', 'https://pubmed.ncbi.nlm.nih.gov/111/'],
    ]);
    expect(sources[1].id).toBe('pmid-111');
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

  describe('stripUnknownCitations', () => {
    const valid = [1, 2, 3];

    it('drops markers for numbers that are not in the source list', () => {
      expect(stripUnknownCitations('Fine in moderation [7].', valid)).toBe('Fine in moderation.');
      expect(stripUnknownCitations('Fine [2][9] and safe [4].', valid)).toBe('Fine [2] and safe.');
    });

    it('keeps the valid numbers inside a grouped marker', () => {
      expect(stripUnknownCitations('Shown in trials [1, 7, 3].', valid)).toBe('Shown in trials [1, 3].');
      expect(stripUnknownCitations('Shown [8, 9].', valid)).toBe('Shown.');
    });

    it('leaves valid citations, markdown links and line breaks alone', () => {
      const t = 'Caffeine [1][3].\n[2] at line start.\nA [link](https://x.org) and [4](https://y.org).';
      expect(stripUnknownCitations(t, valid)).toBe(t);
      expect(stripUnknownCitations('One.\n[5] Two.', valid)).toBe('One.\n Two.');
    });

    it('removes every marker when no sources were given', () => {
      expect(stripUnknownCitations('General advice [1].', [])).toBe('General advice.');
    });

    it('works with non-contiguous numbers from a saved footer', () => {
      expect(stripUnknownCitations('A [1]. B [2]. C [3].', [1, 3])).toBe('A [1]. B. C [3].');
    });

    it('then only the cited, existing sources are shown', () => {
      const text = stripUnknownCitations('Fine [3]. Made up [6].', valid);
      expect(citedSources(text, SOURCES).map((s) => s.n)).toEqual([3]);
      expect(citedSources(stripUnknownCitations('Nothing [9].', valid), SOURCES)).toEqual([]);
    });

    it('client and server strip the same way', () => {
      for (const t of ['A [1, 7].', 'B [9][2].', 'C\n[4] d [3]', 'E [12](https://x.org) [0]']) {
        expect(stripUnknownCitations(t, valid)).toBe(serverStripUnknownCitations(t, valid));
      }
    });

    it('the stored footer lists only valid cited sources after stripping', () => {
      const answer = stripUnknownCitations('Fine [2]. Invented [5].', valid);
      const footer = formatSourcesFooter(SOURCES as Parameters<typeof formatSourcesFooter>[0], answer);
      expect(footer).toContain('[2]');
      expect(footer).not.toContain('[5]');
      expect(footer).not.toContain('[1]');
    });
  });
});

describe('full-text marker in the saved footer', () => {
  it('round-trips the licence of sources the AI read in full text', async () => {
    const { formatSourcesFooter } = await import('../../api/_lib/research/library');
    const src = [
      { n: 1, id: 'pmid-1', pmid: '1', title: 'Iron in pregnancy', source: 'Cochrane', year: 2024, evidenceLevel: 'systematic review' as const, url: 'https://pubmed.ncbi.nlm.nih.gov/1/', fulltext: 'CC BY' },
      { n: 2, id: 'pmid-2', pmid: '2', title: 'Folic acid', source: 'NICE, UK', year: 2021, evidenceLevel: 'guideline' as const, url: 'https://pubmed.ncbi.nlm.nih.gov/2/' },
    ];
    const answer = 'Iron helps [1]. Folic acid too [2].';
    const { body, sources } = splitSourcesFooter(answer + formatSourcesFooter(src, answer));
    expect(body).toBe(answer);
    expect(sources[0]).toMatchObject({ n: 1, source: 'Cochrane', year: 2024, fulltext: 'CC BY' });
    expect(sources[1]).toMatchObject({ n: 2, source: 'NICE, UK', year: 2021 });
    expect(sources[1].fulltext).toBeUndefined();
  });
});
