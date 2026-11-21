// Tests for the pure parts of scripts/research/fulltext.mjs (licence
// filter, JATS parsing, chunking, size budget) on a tiny JATS fixture.
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain .mjs build script without type declarations
import * as ft from '../../../scripts/research/fulltext.mjs';

const JATS = `<?xml version="1.0"?>
<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.4//EN" "JATS-archivearticle1-4.dtd">
<article article-type="review-article"><front><article-meta>
<article-id pub-id-type="pmcid">PMC123</article-id>
<title-group><article-title>Iron &amp; pregnancy: a <italic>review</italic></article-title></title-group>
<contrib-group>
 <contrib contrib-type="author"><name><surname>Doe</surname><given-names>Jane Anne</given-names></name></contrib>
 <contrib contrib-type="author"><name><surname>Roe</surname><given-names>R</given-names></name></contrib>
 <contrib contrib-type="author"><collab>The Iron Group</collab></contrib>
 <contrib contrib-type="author"><name><surname>Poe</surname><given-names>E</given-names></name></contrib>
</contrib-group>
<permissions><license xlink:href="https://creativecommons.org/licenses/by/4.0/"><license-p>CC BY</license-p></license></permissions>
<abstract><sec><title>Objective</title><p>To assess iron.</p></sec><sec><title>Results</title><p>Iron helped.</p></sec></abstract>
<abstract abstract-type="graphical"><p>GRAPHICAL ABSTRACT TEXT</p></abstract>
<abstract abstract-type="plain-language-summary"><p>Iron pills help mums.</p></abstract>
</article-meta></front>
<body>
<sec><title>1. Introduction</title><p>Anaemia is common <xref ref-type="bibr" rid="r1">[1]</xref>, <xref ref-type="bibr" rid="r2">[2]</xref>.
It affects 40% of pregnancies.<sup><xref ref-type="bibr" rid="r3">3</xref>,<xref ref-type="bibr" rid="r4">4</xref></sup> Area is 2 m<sup>2</sup>.</p></sec>
<sec sec-type="methods"><title>Methods</title><sec><title>Search</title><p>We searched <![CDATA[MEDLINE & Embase]]>.</p>
<list><list-item><p>Trials</p></list-item><list-item><p>Cohorts</p></list-item></list></sec></sec>
<sec><title>RESULTS</title><p>Iron reduced anaemia (RR 0.30).
<table-wrap id="t1"><label>Table 1</label><caption><p>Main outcomes</p></caption>
<table><thead><tr><th>Outcome</th><th>RR</th></tr></thead><tbody><tr><td>Anaemia</td><td>0.30</td></tr></tbody></table>
<table-wrap-foot><fn><p>FOOTNOTE SHOULD GO</p></fn></table-wrap-foot></table-wrap></p>
<fig id="f1"><label>Figure 1</label><caption><title>Forest plot.</title><p>Iron vs placebo.</p></caption><graphic xlink:href="f1.jpg"/></fig></sec>
<sec><title>Treatment of Iron Deficiency in Practice</title><p>Give 60 mg daily.</p></sec>
<sec><title>Conflicts of interest</title><p>NONE DECLARED SHOULD GO</p></sec>
<sec><title>Conclusions</title><p>Iron works.</p></sec>
</body>
<back><ack><p>THANKS SHOULD GO</p></ack><ref-list><ref id="r1"><mixed-citation>REFERENCE SHOULD GO</mixed-citation></ref></ref-list></back>
</article>`;

describe('licence filter', () => {
  it('normalises PMC licence codes', () => {
    expect(ft.normaliseLicence('CC BY')).toBe('CC BY');
    expect(ft.normaliseLicence('cc-by')).toBe('CC BY');
    expect(ft.normaliseLicence('CC BY-NC-ND')).toBe('CC BY-NC-ND');
    expect(ft.normaliseLicence('cc by nc 4.0')).toBe('CC BY-NC');
    expect(ft.normaliseLicence('CC0')).toBe('CC0');
    expect(ft.normaliseLicence('TDM')).toBe('TDM');
    expect(ft.normaliseLicence(null)).toBe('UNKNOWN');
  });
  it('keeps only CC0, CC BY, CC BY-SA', () => {
    expect(['CC0', 'CC BY', 'CC BY-SA', 'CC BY-NC', 'CC BY-ND', 'CC BY-NC-SA', 'TDM', 'UNKNOWN'].filter(ft.isReusable)).toEqual([
      'CC0',
      'CC BY',
      'CC BY-SA',
    ]);
  });
});

describe('parseJats', () => {
  const parsed = ft.parseJats(JATS);
  const all = parsed.paragraphs.map((p: { text: string }) => p.text).join('\n');

  it('reads title, credit and licence URL', () => {
    expect(parsed.title).toBe('Iron & pregnancy: a review');
    expect(parsed.credit).toBe('Doe JA, Roe R, The Iron Group, et al.');
    expect(parsed.licenceUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(parsed.hasBody).toBe(true);
  });

  it('maps sections to canonical names and keeps free headings', () => {
    const sections = [...new Set(parsed.paragraphs.map((p: { section: string }) => p.section))];
    expect(sections).toEqual([
      'Abstract',
      'Plain language summary',
      'Introduction',
      'Methods',
      'Results',
      'Treatment of Iron Deficiency in Practice',
      'Conclusions',
    ]);
  });

  it('prefixes abstract sub-headings and skips graphical abstracts', () => {
    expect(all).toContain('Objective: To assess iron.');
    expect(all).toContain('Results: Iron helped.');
    expect(all).not.toContain('GRAPHICAL');
  });

  it('removes citations, references, back matter, COI and table footnotes', () => {
    expect(all).toContain('Anaemia is common.');
    expect(all).toContain('It affects 40% of pregnancies. Area is 2 m^2.');
    for (const gone of ['[1]', 'REFERENCE', 'THANKS', 'NONE DECLARED', 'FOOTNOTE', 'f1.jpg']) expect(all).not.toContain(gone);
  });

  it('keeps lists, CDATA, table text and captions', () => {
    expect(all).toContain('We searched MEDLINE & Embase.');
    expect(all).toContain('• Trials');
    expect(all).toContain('Table 1. Main outcomes\nOutcome | RR\nAnaemia | 0.30');
    expect(all).toContain('Figure 1. Forest plot. Iron vs placebo.');
  });
});

describe('chunking', () => {
  it('splits sentences without breaking on abbreviations or decimals', () => {
    expect(ft.splitSentences('Smith et al. found a RR of 0.30 (95% CI 0.2-0.4). Effects were large, e.g. in Fig. 2. Next one!')).toEqual([
      'Smith et al. found a RR of 0.30 (95% CI 0.2-0.4).',
      'Effects were large, e.g. in Fig. 2.',
      'Next one!',
    ]);
  });

  it('packs ~800-1200 char passages on sentence boundaries', () => {
    const sentence = (i: number) => `Sentence number ${i} reports a finding about iron and anaemia in pregnant women today.`;
    const paras = Array.from({ length: 6 }, (_, p) => Array.from({ length: 8 }, (_, i) => sentence(p * 8 + i)).join(' '));
    const chunks: string[] = ft.chunkParagraphs(paras);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1500);
      expect(c).toMatch(/^Sentence number \d+/);
      expect(c).toMatch(/today\.$/);
    }
    for (const c of chunks.slice(0, -1)) expect(c.length).toBeGreaterThanOrEqual(600);
    expect(chunks.join(' ').replace(/\n/g, ' ')).toBe(paras.join(' '));
  });

  it('hard-splits a single over-long sentence', () => {
    const long = 'word '.repeat(600).trim() + '.';
    const chunks: string[] = ft.chunkParagraphs([long]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1500);
  });

  it('never mixes sections in one passage', () => {
    const passages = ft.chunkArticle(ft.parseJats(JATS));
    expect(passages.map((p: { section: string }) => p.section)).toEqual([
      'Abstract',
      'Plain language summary',
      'Introduction',
      'Methods',
      'Results',
      'Treatment of Iron Deficiency in Practice',
      'Conclusions',
    ]);
  });
});

describe('size budget', () => {
  const mk = (pmid: string, section: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `${pmid}#${i}`, pmid, pmcid: 'PMC1', section, text: 'x'.repeat(1000), licence: 'CC BY' }));

  it('is a no-op under budget', () => {
    const chunks = mk('1', 'Methods', 3);
    expect(ft.applyBudget(chunks, 1e9)).toEqual({ chunks, pruned: null });
  });

  it('drops non-priority sections first, then caps per article', () => {
    const chunks = [...mk('1', 'Methods', 20), ...mk('1', 'Results', 5), ...mk('1', 'Summary of recommendations', 2)];
    const r1 = ft.applyBudget(chunks, 10_000);
    expect(r1.chunks.every((c: { section: string }) => c.section !== 'Methods')).toBe(true);
    expect(r1.chunks).toHaveLength(7);
    const r2 = ft.applyBudget([...mk('1', 'Results', 60)], 20_000);
    expect(r2.chunks.length).toBeLessThan(20);
    expect(r2.pruned).toMatch(/per article/);
  });
});
