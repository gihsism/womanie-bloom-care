import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LIFE_STAGES, getLibrary, selectChatSources } from './library';
import {
  ITEM_LIFE_STAGES,
  buildGuidelineItem,
  chunkBlocks,
  decodeEntities,
  extractPage,
  extractiveSummary,
  guidelineItemId,
  normaliseDate,
  parseHtml,
  parseRobots,
  publisherFor,
  robotsAllows,
  splitSentences,
  textContent,
  validateLibraryItem,
  type PageBlock,
} from './guideline-page';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', 'guideline-pages', `${name}.html`), 'utf8');

describe('HTML parsing', () => {
  it('decodes named and numeric entities, leaves unknown ones', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#8217; &#x2265; &nbsp;x &bogus;')).toBe("a & b <c> ’ ≥  x &bogus;");
  });

  it('tolerates unclosed <p>/<li>, comments and script bodies containing tags', () => {
    const doc = parseHtml('<div><p>one<p>two<ul><li>a<li>b</ul><!-- <p>no</p> --><script>if (a<b) "<p>x</p>"</script></div>');
    const div = doc.children[0] as Exclude<(typeof doc.children)[number], string>;
    expect(div.children.map((c) => (typeof c === 'string' ? c : c.tag))).toEqual(['p', 'p', 'ul', 'script']);
    expect(textContent(doc)).toBe('onetwoab');
  });
});

describe('main-text extraction', () => {
  it('NHS-style page: keeps <main>, drops cookie banner, breadcrumbs, contents list, review footer, hidden text', () => {
    const p = extractPage(fixture('nhs-style'));
    expect(p.meta.title).toBe('Examplol for adults: a made-up painkiller');
    expect(p.meta.lastReviewed).toBe('2025-08-27');
    expect(p.meta.nextReview).toBe('2028-08-27');
    expect(p.meta.copyright).toBe('© Crown copyright');
    expect(p.meta.language).toBe('en');
    for (const noise of ['cookies', 'Skip to', 'Medicines A to Z', 'About examplol', 'Page last reviewed', 'Hidden helper', 'commented-out', 'not content', 'Other brands'])
      expect(p.text, noise).not.toContain(noise);
    expect(p.blocks.filter((b) => b.type === 'heading').map((b) => (b as { text: string }).text)).toEqual([
      'How to take examplol',
      'Who can and cannot take examplol',
      'Breastfeeding and examplol',
      'Pregnancy and examplol',
    ]);
    expect(p.blocks).toContainEqual({ type: 'item', text: '1 or 2 tablets, up to 3 times a day' });
    expect(p.text).toContain('Very little gets into breast milk (under 1%).');
    expect(p.text).toContain('If you’re breastfeeding');
  });

  it('CDC-style page: falls back to <article>, reads table rows, meta and US-format dates', () => {
    const p = extractPage(fixture('cdc-style'));
    expect(p.meta.title).toBe('Pretend Birth Control Methods');
    expect(p.meta.lastUpdated).toBe('2024-08-06');
    expect(p.meta.lastReviewed).toBe('2024-08-06');
    expect(p.meta.siteName).toBe('Centers for Disease Control and Prevention');
    expect(p.blocks).toContainEqual({ type: 'row', text: 'Method A | 0.1' });
    expect(p.blocks).toContainEqual({ type: 'row', text: 'Method B | 7' });
    expect(p.text).not.toMatch(/Share on Facebook|Related pages|Contraception home/);
  });

  it('bare page: uses #content, skips hidden/aria-hidden, decodes text entities, reads "Published:"', () => {
    const p = extractPage(fixture('bare'));
    expect(p.meta.published).toBe('2021-03-03');
    expect(p.text).not.toMatch(/secret|decorative/);
    expect(p.text).toContain('A <tag> written as text, a pound sign £5 and ≥ 3.');
    expect(p.blocks[0]).toEqual({ type: 'para', text: 'First paragraph without a closing tag' });
  });

  it('normalises the date formats publishers use', () => {
    expect(normaliseDate('14 August 2025')).toBe('2025-08-14');
    expect(normaliseDate('August 15, 2025')).toBe('2025-08-15');
    expect(normaliseDate('Aug 2025')).toBe('2025-08');
    expect(normaliseDate('2025-08-14T10:00:00Z')).toBe('2025-08-14');
    expect(normaliseDate('8/6/2024')).toBe('2024-08-06');
    expect(normaliseDate('soon')).toBeNull();
  });
});

describe('sentences and chunks', () => {
  it('splits sentences but keeps e.g., U.S. and decimals together', () => {
    expect(splitSentences('Take 1.5 mg, e.g. with food. See the U.S. MEC. Done!')).toEqual(['Take 1.5 mg, e.g. with food.', 'See the U.S. MEC.', 'Done!']);
  });

  it('starts a chunk at every heading and records the heading path', () => {
    const chunks = chunkBlocks('gp-x', extractPage(fixture('nhs-style')).blocks);
    expect(chunks.map((c) => c.section)).toEqual([
      '',
      'How to take examplol',
      'Who can and cannot take examplol > Breastfeeding and examplol',
      'Who can and cannot take examplol > Pregnancy and examplol',
    ]);
    expect(chunks.map((c) => c.id)).toEqual(['gp-x#1', 'gp-x#2', 'gp-x#3', 'gp-x#4']);
    expect(chunks[1].text).toContain('- 1 or 2 tablets');
  });

  it('keeps every chunk under maxChars, splits at sentence ends, loses no text', () => {
    const sentence = (i: number) => `Sentence number ${i} has a few words in it to fill space.`;
    const long = Array.from({ length: 60 }, (_, i) => sentence(i)).join(' ');
    const blocks: PageBlock[] = [{ type: 'heading', level: 2, text: 'Long' }, { type: 'para', text: long }, { type: 'para', text: 'x'.repeat(2500) }];
    const chunks = chunkBlocks('gp-y', blocks, { maxChars: 500, targetChars: 300 });
    expect(chunks.every((c) => c.text.length <= 500)).toBe(true);
    expect(chunks.every((c) => c.section === 'Long')).toBe(true);
    const joined = chunks.map((c) => c.text).join(' ').replace(/\s+/g, '');
    expect(joined).toBe((long + 'x'.repeat(2500)).replace(/\s+/g, ''));
    // Sentence chunks end on a sentence boundary.
    expect(chunks.filter((c) => c.text.startsWith('Sentence')).every((c) => c.text.endsWith('.'))).toBe(true);
  });
});

describe('extractive summary (no model call)', () => {
  it('builds the summary from the first sentences plus the h2 headings', () => {
    const s = extractiveSummary(extractPage(fixture('nhs-style')));
    expect(s.summary).toBe(
      'Examplol is a pretend painkiller used only in tests. It helps with mild pain & swelling (inflammation). Covers: How to take examplol; Who can and cannot take examplol.',
    );
    expect(s.keyPoints[0]).toBe('How to take examplol: The usual dose is: 1 or 2 tablets, up to 3 times a day; at least 4 hours between doses.');
  });

  it('puts sections about the curated focus terms first', () => {
    const s = extractiveSummary(extractPage(fixture('nhs-style')), ['breastfeeding', 'examplol']);
    expect(s.keyPoints[0]).toBe('Breastfeeding and examplol: If you’re breastfeeding, check with a pharmacist first.');
  });

  it('every key point is text from the page', () => {
    const page = extractPage(fixture('cdc-style'));
    const s = extractiveSummary(page);
    expect(s.keyPoints.length).toBeGreaterThanOrEqual(2);
    for (const k of s.keyPoints) expect(page.text.replace(/\s+/g, ' ')).toContain(k.split(': ').slice(1).join(': ') || k);
    expect(s.summary).not.toContain('August 6, 2024'); // date line is not a summary sentence
  });
});

describe('publishers and robots.txt', () => {
  it('only listed publishers are known; NICE and WHO need a licence first', () => {
    expect(publisherFor('https://www.nhs.uk/conditions/infertility/')?.ingest).toBe('allowed');
    expect(publisherFor('https://www.cdc.gov/x')?.licence.name).toMatch(/Public domain/);
    expect(publisherFor('https://www.nice.org.uk/guidance/ng257')?.ingest).toBe('licence-required');
    expect(publisherFor('https://cdn.who.int/x.pdf')?.ingest).toBe('licence-required');
    expect(publisherFor('https://example.com/')).toBeNull();
  });

  it('Swiss official sources (BAG, BLV, SGGG) are summary-only: hand-written summaries, never fetched', () => {
    expect(publisherFor('https://www.bag.admin.ch/de/schweizerischer-impfplan')?.ingest).toBe('summary-only');
    expect(publisherFor('https://www.blv.admin.ch/de/naehrstoffzufuhr')?.publisher).toBe('BLV');
    expect(publisherFor('https://www.rosenfluh.ch/media/gynaekologie/2024/01/x.pdf')?.publisher).toBe('SGGG');
    const lib = JSON.parse(readFileSync(join(process.cwd(), 'api', '_lib', 'research', 'library.json'), 'utf8'));
    const topicIds = new Set<string>(lib.topics.map((t: { id: string }) => t.id));
    const swiss = lib.items.filter((it: { sourceType?: string }) => it.sourceType === 'guideline-page');
    expect(swiss.length).toBeGreaterThanOrEqual(7);
    for (const it of swiss) {
      expect(validateLibraryItem(it, topicIds), it.id).toEqual([]);
      expect(it.page.summariser).toBe('hand-written');
    }
    // A summary-only item must be hand-written, not an extractive copy of the page.
    const copied = { ...swiss[0], page: { ...swiss[0].page, summariser: 'extractive-v1', chunks: 3 } };
    expect(validateLibraryItem(copied, topicIds).join(' ')).toMatch(/hand-written/);
  });

  it('the chat can pick the Swiss sources for Swiss questions (keyword retrieval)', () => {
    const top = (q: string, stage: string) => selectChatSources(q, stage)[0]?.id ?? '';
    expect(top('Does Swiss basic insurance cover the pre-eclampsia test in the first trimester?', 'pregnancy')).toMatch(/^gp-bag-kommentar/);
    expect(top('What does Swiss health insurance pay for in pregnancy?', 'pregnancy')).toMatch(/^gp-bag-krankenversicherung/);
    expect(top('How much calcium do I need after menopause in Switzerland?', 'menopause')).toMatch(/^gp-blv-naehrstoffzufuhr/);
    expect(top('When do I get the whooping cough vaccine in pregnancy in Switzerland?', 'pregnancy')).toMatch(/^gp-bag-schweizerischer-impfplan/);
    expect(top('Is a DEXA scan covered by insurance in Switzerland?', 'post-menopause')).toMatch(/^gp-bag-anhang-1/);
    // Questions that do not mention Switzerland keep their PubMed sources.
    expect(top('Is coffee safe in pregnancy?', 'pregnancy')).toMatch(/^pmid-/);
  });

  const robots = parseRobots(`
User-agent: Ultraseek
Disallow: /

User-agent: *
Crawl-delay: 1
Disallow: /Conditions/
Disallow: /private
Allow: /private/ok$
Disallow: /*.pdf$
`);

  it('applies the * group, longest match, allow on ties and $ / * wildcards, case-sensitively', () => {
    expect(robotsAllows(robots, 'https://x.org/conditions/infertility/').allowed).toBe(true);
    expect(robotsAllows(robots, 'https://x.org/Conditions/infertility/').allowed).toBe(false);
    expect(robotsAllows(robots, 'https://x.org/private/a').allowed).toBe(false);
    expect(robotsAllows(robots, 'https://x.org/private/ok').allowed).toBe(true);
    expect(robotsAllows(robots, 'https://x.org/files/a.pdf').allowed).toBe(false);
    expect(robotsAllows(robots, 'https://x.org/files/a.pdf?x=1').allowed).toBe(true);
    expect(robotsAllows(robots, 'https://x.org/a').crawlDelay).toBe(1);
  });

  it('a group naming our agent replaces the * group', () => {
    const r = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: WomanieResearchLibrarian\nDisallow: /');
    expect(robotsAllows(r, 'https://x.org/a').allowed).toBe(false);
    expect(robotsAllows(parseRobots(''), 'https://x.org/a').allowed).toBe(true);
  });
});

describe('schema validation', () => {
  const lib = getLibrary();
  const topicIds = new Set(lib.topics.map((t) => t.id));
  const policy = publisherFor('https://www.nhs.uk/medicines/examplol/')!;
  const page = extractPage(fixture('nhs-style'));
  const make = () =>
    buildGuidelineItem({
      page,
      policy,
      curation: { url: 'https://www.nhs.uk/medicines/examplol/', lifeStages: ['postpartum'], topics: ['medicines-breastfeeding'], tags: ['Breastfeeding'], keywords: ['painkiller'] },
      summary: extractiveSummary(page),
      summariser: 'extractive-v1',
      fetchedAt: '2026-11-26T00:00:00.000Z',
      robotsRule: null,
      chunkCount: 4,
    });

  it('the local stage list mirrors library.ts', () => {
    expect([...ITEM_LIFE_STAGES]).toEqual([...LIFE_STAGES]);
  });

  it('every existing library.json item passes (PubMed rules)', () => {
    const bad = lib.items.map((it) => [it.id, validateLibraryItem(it, topicIds)] as const).filter(([, e]) => e.length);
    expect(bad).toEqual([]);
  });

  it('a built guideline-page item is valid and carries licence, dates and provenance', () => {
    const item = make();
    expect(validateLibraryItem(item, topicIds)).toEqual([]);
    expect(item.sourceType).toBe('guideline-page');
    expect(item.id).toBe(guidelineItemId('https://www.nhs.uk/medicines/examplol/', 'NHS'));
    expect(item.pmid).toBe('');
    expect(item.year).toBe(2025);
    expect(item.tags).toEqual(['breastfeeding']);
    expect(item.page.licence.name).toBe('Open Government Licence v3.0');
    expect(item.page.licence.pageCopyright).toBe('© Crown copyright');
    expect(item.page.refreshDays).toBe(7);
    expect(item.page.lastReviewed).toBe('2025-08-27');
  });

  it('catches broken guideline-page items', () => {
    const cases: [string, (it: ReturnType<typeof make>) => void, RegExp][] = [
      ['pmid', (it) => (it.pmid = '123'), /pmid/],
      ['unknown stage', (it) => (it.lifeStages = ['teen']), /lifeStages/],
      ['unknown topic', (it) => (it.topics = ['nope']), /unknown "nope"/],
      ['one key point', (it) => (it.keyPoints = ['x']), /keyPoints/],
      ['no licence', (it) => (it.page.licence.name = ''), /licence/],
      ['robots not checked', (it) => ((it.page.robots as { allowed: boolean }).allowed = false), /robots/],
      ['NICE host', (it) => ((it.url = 'https://www.nice.org.uk/guidance/ng257'), (it.page.url = it.url)), /needs a licence/],
      ['unknown host', (it) => ((it.url = 'https://example.com/a'), (it.page.url = it.url)), /not a known publisher/],
      ['bad date', (it) => (it.page.lastReviewed = '27 August 2025'), /lastReviewed/],
      ['http', (it) => ((it.url = 'http://www.nhs.uk/x'), (it.page.url = it.url)), /https/],
    ];
    for (const [name, mutate, re] of cases) {
      const it = make();
      mutate(it);
      expect(validateLibraryItem(it, topicIds).join('; '), name).toMatch(re);
    }
    expect(validateLibraryItem({ ...make(), sourceType: 'tweet' })).toContain('sourceType: unknown "tweet"');
  });

  const STAGING = join(__dirname, 'staging', 'guideline-pages.json');
  it.skipIf(!existsSync(STAGING))('the staged candidates are valid and none is in library.json', () => {
    const staging = JSON.parse(readFileSync(STAGING, 'utf8'));
    expect(staging.dryRun).toBe(true);
    const ids = new Set(lib.items.map((i) => i.id));
    const urls = new Set(lib.items.map((i) => i.url));
    for (const it of staging.items) {
      expect(validateLibraryItem(it, topicIds), it.id).toEqual([]);
      expect(ids.has(it.id) || urls.has(it.url), it.id).toBe(false);
      expect(staging.embeddings[it.id], it.id).toBeTruthy();
      expect(staging.chunks[it.id]?.length, it.id).toBe(it.page.chunks);
    }
  });
});
