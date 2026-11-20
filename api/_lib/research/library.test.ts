import { describe, it, expect } from 'vitest';
import {
  LIFE_STAGES,
  browseItems,
  buildSourcesPrompt,
  citedNumbers,
  evidenceForTopic,
  formatSourcesFooter,
  getLibrary,
  normalizeLifeStage,
  searchItems,
  searchResearch,
  selectChatSources,
  toChatSources,
  type ResearchItem,
} from './library';

function item(over: Partial<ResearchItem> & { pmid: string }): ResearchItem {
  return {
    id: `pmid-${over.pmid}`,
    doi: null,
    title: 'Untitled review',
    source: 'Cochrane Database of Systematic Reviews',
    journal: 'Cochrane Database of Systematic Reviews',
    organisation: null,
    year: 2020,
    publicationTypes: ['Systematic Review'],
    evidenceLevel: 'systematic review',
    url: `https://pubmed.ncbi.nlm.nih.gov/${over.pmid}/`,
    summary: 'A summary.',
    keyPoints: ['Point one.', 'Point two.'],
    certainty: 'not stated',
    lifeStages: ['general'],
    topics: ['misc'],
    tags: ['misc'],
    keywords: ['misc'],
    ...over,
  };
}

const FIXTURES: ResearchItem[] = [
  item({
    pmid: '1',
    title: 'Restricted caffeine intake in pregnancy',
    lifeStages: ['pregnancy'],
    topics: ['caffeine-pregnancy'],
    tags: ['caffeine', 'pregnancy'],
    keywords: ['coffee', 'tea', 'caffeine', 'energy drinks'],
    summary: 'Limiting caffeine in pregnancy and birth weight.',
  }),
  item({
    pmid: '2',
    title: 'Coffee consumption and health: umbrella review',
    lifeStages: ['general'],
    topics: ['caffeine-pregnancy'],
    tags: ['coffee'],
    keywords: ['coffee', 'caffeine'],
  }),
  item({
    pmid: '3',
    title: 'Menopausal hormone therapy and breast cancer',
    lifeStages: ['menopause', 'post-menopause'],
    topics: ['hrt-benefits-risks'],
    tags: ['hrt', 'breast cancer'],
    keywords: ['hrt', 'hormone therapy', 'breast cancer'],
    evidenceLevel: 'guideline',
  }),
  item({
    pmid: '4',
    title: 'Caffeine and fertility in women trying to conceive',
    lifeStages: ['conception'],
    topics: ['lifestyle-fertility'],
    tags: ['caffeine', 'fertility'],
    keywords: ['coffee', 'caffeine', 'trying to conceive'],
  }),
  item({
    pmid: '5',
    title: 'Pelvic floor muscle training after childbirth',
    lifeStages: ['postpartum'],
    topics: ['pelvic-floor'],
    tags: ['pelvic floor'],
    keywords: ['pelvic floor', 'incontinence', 'kegel'],
  }),
];

describe('searchItems ranking', () => {
  it('ranks keyword/tag matches first and drops non-matches', () => {
    const res = searchItems(FIXTURES, 'Is coffee OK in pregnancy?');
    const ids = res.map((r) => r.item.pmid);
    expect(ids[0]).toBe('1');
    expect(ids).not.toContain('3');
    expect(ids).not.toContain('5');
  });

  it('boosts the user life stage over other stages', () => {
    const preg = searchItems(FIXTURES, 'coffee caffeine', { lifeStage: 'pregnancy' });
    expect(preg[0].item.pmid).toBe('1');
    const ttc = searchItems(FIXTURES, 'coffee caffeine', { lifeStage: 'conception' });
    expect(ttc[0].item.pmid).toBe('4');
  });

  it('understands everyday synonyms (HRT, coffee)', () => {
    expect(searchItems(FIXTURES, 'should I take HRT')[0].item.pmid).toBe('3');
    // "tea" only reaches caffeine items through the synonym map / keywords
    const tea = searchItems(FIXTURES, 'tea').map((r) => r.item.pmid);
    expect(tea).toContain('1');
  });

  it('strictStage keeps only that stage plus general items', () => {
    const res = searchItems(FIXTURES, '', { lifeStage: 'pregnancy', strictStage: true });
    expect(res.map((r) => r.item.pmid).sort()).toEqual(['1', '2']);
    const noGeneral = searchItems(FIXTURES, '', { lifeStage: 'pregnancy', strictStage: true, excludeGeneral: true });
    expect(noGeneral.map((r) => r.item.pmid)).toEqual(['1']);
  });

  it('filters by topic', () => {
    const res = searchItems(FIXTURES, '', { topic: 'caffeine-pregnancy' });
    expect(res.map((r) => r.item.pmid).sort()).toEqual(['1', '2']);
  });

  it('maps app modes onto library stages', () => {
    expect(normalizeLifeStage('pre-menstrual')).toBe('menstrual-cycle');
    expect(normalizeLifeStage('pregnant')).toBe('pregnancy');
    expect(normalizeLifeStage('post-menopause')).toBe('post-menopause');
    expect(normalizeLifeStage('nonsense')).toBeNull();
    expect(normalizeLifeStage(undefined)).toBeNull();
  });
});

describe('chat source selection and injection', () => {
  it('returns no sources for questions the library cannot answer', () => {
    expect(selectChatSources('what time is it', 'pregnancy', FIXTURES)).toEqual([]);
    expect(selectChatSources('', 'pregnancy', FIXTURES)).toEqual([]);
  });

  it('picks at most 6 sources, best first', () => {
    const picked = selectChatSources('coffee caffeine pregnancy', 'pregnancy', FIXTURES);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThanOrEqual(6);
    expect(picked[0].pmid).toBe('1');
  });

  it('numbers the prompt sources and the returned sources identically', () => {
    const picked = selectChatSources('coffee caffeine pregnancy', 'pregnancy', FIXTURES);
    const prompt = buildSourcesPrompt(picked);
    const sources = toChatSources(picked);
    sources.forEach((s, i) => {
      expect(s.n).toBe(i + 1);
      expect(s.pmid).toBe(picked[i].pmid);
      expect(s.url).toBe(picked[i].url);
      expect(prompt).toContain(`[${s.n}] ${picked[i].title}`);
    });
    expect(prompt).toMatch(/Cite only sources you actually used/);
    expect(prompt).toMatch(/Never cite anything that is not in this list/);
    expect(prompt).toMatch(/uncertain/);
  });

  it('tells the model not to cite when nothing matched', () => {
    expect(buildSourcesPrompt([])).toMatch(/Do not cite any sources/);
  });

  it('stores only the sources the answer cited', () => {
    const sources = toChatSources(FIXTURES.slice(0, 3));
    expect(citedNumbers('Coffee is fine in moderation [1][3]. See [9].', 3)).toEqual([1, 3]);
    const footer = formatSourcesFooter(sources, 'Moderate coffee is fine [2].');
    expect(footer).toContain('pubmed.ncbi.nlm.nih.gov/2/');
    expect(footer).not.toContain('pubmed.ncbi.nlm.nih.gov/1/');
    expect(formatSourcesFooter(sources, 'No citations here.')).toBe('');
  });
});

describe('library.json data file', () => {
  const lib = getLibrary();

  it('has a reasonable number of items and stays small', () => {
    expect(lib.items.length).toBeGreaterThanOrEqual(150);
    expect(lib.items.length).toBeLessThanOrEqual(400);
    expect(JSON.stringify(lib).length).toBeLessThan(1.5 * 1024 * 1024);
  });

  it('every item has a PMID, PubMed URL, and non-empty summary, key points and tags', () => {
    const bad: string[] = [];
    const seen = new Set<string>();
    for (const it of lib.items) {
      const ok =
        /^\d+$/.test(it.pmid) &&
        it.url === `https://pubmed.ncbi.nlm.nih.gov/${it.pmid}/` &&
        it.title.trim() !== '' &&
        it.source.trim() !== '' &&
        it.summary.trim().length > 40 &&
        it.keyPoints.length >= 2 &&
        it.keyPoints.every((k) => k.trim() !== '') &&
        it.tags.length > 0 &&
        it.keywords.length > 0 &&
        it.topics.length > 0 &&
        it.lifeStages.length > 0 &&
        it.lifeStages.every((s) => (LIFE_STAGES as readonly string[]).includes(s)) &&
        ['guideline', 'systematic review', 'study'].includes(it.evidenceLevel) &&
        it.year >= 1950 && it.year <= new Date().getFullYear() + 1 &&
        !seen.has(it.pmid);
      seen.add(it.pmid);
      if (!ok) bad.push(it.pmid);
    }
    expect(bad).toEqual([]);
  });

  it('every item topic is a declared topic', () => {
    const ids = new Set(lib.topics.map((t) => t.id));
    for (const it of lib.items) for (const t of it.topics) expect(ids.has(t)).toBe(true);
  });

  it('covers every life stage', () => {
    for (const stage of LIFE_STAGES) {
      expect(browseItems({ lifeStage: stage }).length).toBeGreaterThanOrEqual(10);
    }
  });

  it('finds real caffeine-in-pregnancy evidence for the coffee question', () => {
    const picked = selectChatSources('Is coffee OK in pregnancy?', 'pregnancy');
    expect(picked.length).toBeGreaterThanOrEqual(3);
    expect(picked.some((p) => /caffeine/i.test(p.title))).toBe(true);
  });

  it('evidenceForTopic returns best evidence for a topic id or keyword', () => {
    const byTopic = evidenceForTopic('caffeine-pregnancy', { limit: 3 });
    expect(byTopic.length).toBeGreaterThan(0);
    expect(byTopic.every((i) => i.topics.includes('caffeine-pregnancy'))).toBe(true);
    const byKeyword = evidenceForTopic('ferritin', { limit: 3 });
    expect(byKeyword.length).toBeGreaterThan(0);
    expect(searchResearch('ferritin', { limit: 1 })[0].item.pmid).toBe(byKeyword[0].pmid);
  });
});
