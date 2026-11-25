import { describe, it, expect } from 'vitest';
import {
  LIFE_STAGES,
  browseItems,
  buildSourcesPrompt,
  citedNumbers,
  evidenceForTopic,
  formatSourcesFooter,
  getLibrary,
  isAfterBirthTitle,
  normalizeLifeStage,
  searchItems,
  searchResearch,
  selectChatSources,
  splitTopicLabel,
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

  it('splits a topic label into its head and a bracketed example list', () => {
    expect(splitTopicLabel('Medicines in pregnancy (paracetamol, antidepressants)')).toEqual({
      head: 'Medicines in pregnancy',
      aside: 'paracetamol, antidepressants',
    });
    // A bracket without a comma is an alias and stays in the head.
    expect(splitTopicLabel('Polycystic ovary syndrome (PCOS)')).toEqual({ head: 'Polycystic ovary syndrome PCOS', aside: '' });
  });

  describe('named medicines', () => {
    const topics = [
      { id: 'medications-pregnancy', label: 'Medicines in pregnancy (paracetamol, antidepressants)', stages: ['pregnancy' as const] },
      { id: 'migraine', label: 'Migraine and headache', stages: ['general' as const] },
    ];
    const meds: ResearchItem[] = [
      item({
        pmid: '10',
        title: 'Recommendations for antirheumatic drugs in pregnancy and lactation',
        evidenceLevel: 'guideline',
        lifeStages: ['pregnancy'],
        topics: ['medications-pregnancy'],
        tags: ['rheumatology', 'pregnancy'],
        keywords: ['antirheumatic drugs', 'pregnancy', 'medicines in pregnancy'],
      }),
      item({
        pmid: '11',
        title: 'Prenatal paracetamol exposure and childhood asthma',
        lifeStages: ['pregnancy'],
        topics: ['medications-pregnancy'],
        tags: ['paracetamol', 'pregnancy'],
        keywords: ['paracetamol', 'acetaminophen', 'pregnancy'],
      }),
      item({
        pmid: '12',
        title: 'Migraine treatment guideline',
        evidenceLevel: 'guideline',
        lifeStages: ['general'],
        topics: ['migraine'],
        tags: ['migraine', 'headache'],
        keywords: ['migraine', 'headache', 'triptans', 'paracetamol'],
      }),
    ];

    it('a drug named only in the topic label is not a strong match for every item', () => {
      const res = searchItems(meds, 'can I take paracetamol while pregnant?', {}, topics);
      expect(res[0].item.pmid).toBe('11');
      const guideline = res.find((r) => r.item.pmid === '10');
      expect(guideline && guideline.score).toBeLessThan(res[0].score / 2);
    });

    it('ranks the item that names the drug above a guideline that only mentions it', () => {
      const res = searchItems(meds, 'paracetamol for a headache in pregnancy', {}, topics);
      expect(res[0].item.pmid).toBe('11');
    });

    it('brand names reach the generic drug', () => {
      expect(searchItems(meds, 'tylenol', {}, topics)[0].item.pmid).toBe('11');
    });

    it('a pregnancy question puts the pregnancy study above an after-birth one', () => {
      const afterBirth = item({
        pmid: '13',
        title: 'Paracetamol for perineal pain in the early postpartum period',
        lifeStages: ['pregnancy', 'postpartum'],
        topics: ['medications-pregnancy'],
        tags: ['paracetamol', 'perineal pain'],
        keywords: ['paracetamol', 'acetaminophen', 'pregnancy', 'after birth'],
      });
      expect(isAfterBirthTitle(afterBirth.title)).toBe(true);
      expect(isAfterBirthTitle('Prenatal paracetamol exposure and childhood asthma')).toBe(false);
      expect(isAfterBirthTitle('Paracetamol for patent ductus arteriosus in preterm infants')).toBe(true);
      const res = searchItems([afterBirth, meds[1]], 'can I take paracetamol while pregnant?', {}, topics);
      expect(res.map((r) => r.item.pmid)).toEqual(['11', '13']);
      // Without "pregnant" in the question nothing changes for it.
      const plain = searchItems([afterBirth], 'paracetamol perineal pain', {}, topics);
      expect(plain[0].item.pmid).toBe('13');
    });
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

  it('relevance floor: no sources when nothing mentions the subject, only the life stage', () => {
    const q = 'can I eat kombucha while pregnant';
    // Without the floor the pregnancy items match on "pregnant" alone.
    expect(searchItems(FIXTURES, q, { lifeStage: 'pregnancy' }).length).toBeGreaterThan(0);
    expect(searchItems(FIXTURES, q, { lifeStage: 'pregnancy', requireSubject: true })).toEqual([]);
    expect(selectChatSources(q, 'pregnancy', FIXTURES)).toEqual([]);
    // A question whose subject some item names is unaffected.
    expect(selectChatSources('can I drink coffee while pregnant', 'pregnancy', FIXTURES)[0].pmid).toBe('1');
  });

  it('relevance floor keeps semantically close items when nothing mentions the subject', () => {
    const v = (x: number) => new Float32Array([x, Math.sqrt(1 - x * x)]);
    const semantic = {
      query: new Float32Array([1, 0]),
      docs: new Map(FIXTURES.map((it) => [it.id, v(it.pmid === '1' ? 0.6 : 0.3)])),
      weight: 0.5,
      floor: 0.2,
      ceil: 0.4,
    };
    const q = 'can I eat kombucha while pregnant';
    expect(searchItems(FIXTURES, q, { lifeStage: 'pregnancy', semantic }).length).toBeGreaterThan(1);
    expect(searchItems(FIXTURES, q, { lifeStage: 'pregnancy', semantic, requireSubject: true }).map((r) => r.item.pmid)).toEqual(['1']);
  });

  it('only lets the model report doses and safety verdicts a source states', () => {
    for (const prompt of [buildSourcesPrompt(FIXTURES.slice(0, 2)), buildSourcesPrompt([])]) {
      expect(prompt).toMatch(/Never give a dose, amount or schedule that no source above states/);
      expect(prompt).toMatch(/check the label or with a pharmacist or doctor/);
      expect(prompt).toMatch(/do not give a safety verdict of your own/);
    }
    expect(buildSourcesPrompt(FIXTURES.slice(0, 2))).toMatch(/If none does, say so plainly/);
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
    expect(lib.items.length).toBeGreaterThanOrEqual(1500);
    expect(lib.items.length).toBeLessThanOrEqual(3000);
    expect(JSON.stringify(lib).length).toBeLessThan(6 * 1024 * 1024);
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

  // The "paracetamol in pregnancy" search also returned a Cochrane review of
  // paracetamol for a preterm baby's patent ductus arteriosus; the build
  // used to add the topic's 'pregnancy' stage to it and it ranked #1 for
  // "Can I take paracetamol while pregnant?". build-library.mjs now keeps
  // the abstract's own stages for baby-only titles (mergeStages).
  it('a newborn-treatment review is not tagged as pregnancy evidence', () => {
    const pda = lib.items.find((it) => it.pmid === '25758061');
    expect(pda?.lifeStages).toEqual(['postpartum']);
    const top = selectChatSources('Can I take paracetamol while pregnant?', 'pregnancy').slice(0, 3);
    expect(top.length).toBeGreaterThan(0);
    expect(top.some((it) => /ductus|preterm|newborn|neonat/i.test(it.title))).toBe(false);
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
