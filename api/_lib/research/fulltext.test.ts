import { afterEach, describe, expect, it } from 'vitest';
import {
  bestPassages,
  bestPassagesReranked,
  chunksForPmids,
  createFulltextStore,
  formatPassagesForPrompt,
  fulltextAttribution,
  getFulltextStore,
  hasFulltext,
  setFulltextStoreForTests,
  tokenize,
  type FulltextChunk,
  type FulltextIndex,
} from './fulltext';

const chunk = (pmid: string, n: number, section: string, text: string): FulltextChunk => ({
  id: `${pmid}#${n}`,
  pmid,
  pmcid: `PMC${pmid}`,
  section,
  text,
  licence: 'CC BY',
});

const CHUNKS: FulltextChunk[] = [
  chunk('111', 1, 'Abstract', 'Iron supplementation in pregnancy reduced maternal anaemia at term.'),
  chunk('111', 2, 'Methods', 'We searched databases and pooled randomised trials of iron tablets.'),
  chunk('111', 3, 'Results', 'Daily iron reduced anaemia by 70% and iron deficiency by 57% compared with placebo.'),
  chunk('111', 4, 'Discussion', 'Side effects such as constipation and nausea were more common with daily iron.'),
  chunk('222', 1, 'Results', 'Vitamin D supplementation lowered the risk of pre-eclampsia in pregnant women.'),
  chunk('222', 2, 'Conclusions', 'Vitamin D in pregnancy may reduce pre-eclampsia; anaemia was not assessed.'),
  chunk('333', 1, 'Results', 'Exercise during pregnancy reduced gestational diabetes.'),
];

const INDEX: Partial<FulltextIndex> = {
  items: {
    '111': {
      pmcid: 'PMC111',
      version: 1,
      licence: 'CC BY',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      pmcUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC111/',
      title: 'Daily oral iron supplementation during pregnancy.',
      credit: 'Doe J, Roe R, et al.',
      label: 'Full text · CC BY',
      hasBody: true,
      chunks: 4,
      sections: ['Abstract', 'Methods', 'Results', 'Discussion'],
    },
  },
};

describe('tokenize', () => {
  it('lower-cases, drops stop words and stems plurals', () => {
    expect(tokenize('The Studies of Iron Tablets in Women')).toEqual(['iron', 'tablet']);
    expect(tokenize('pre-eclampsia')).toEqual(['pre', 'eclampsia']);
    expect(tokenize('anaemia oestrogen foetal pregnant')).toEqual(tokenize('anemia estrogen fetal pregnancies'));
  });
});

describe('createFulltextStore', () => {
  const store = createFulltextStore(CHUNKS, INDEX);

  it('returns chunks for the given PMIDs in order, ignoring unknown ones', () => {
    expect(store.chunksForPmids(['222', '999', '111']).map((c) => c.id)).toEqual([
      '222#1',
      '222#2',
      '111#1',
      '111#2',
      '111#3',
      '111#4',
    ]);
    expect(store.hasFulltext('333')).toBe(true);
    expect(store.hasFulltext('999')).toBe(false);
  });

  it('ranks the most relevant passage first and only from the chosen studies', () => {
    const top = store.bestPassages('how much did daily iron reduce anaemia', ['111', '222'], 3);
    expect(top[0].id).toBe('111#3');
    expect(top.every((p) => p.pmid !== '333')).toBe(true);
    expect(top.length).toBeLessThanOrEqual(3);
    expect(top[0].score).toBeGreaterThan(top[top.length - 1].score - 1e-9);
  });

  it('caps passages per study so several studies are represented', () => {
    const top = store.bestPassages('iron anaemia pregnancy vitamin', ['111', '222'], 4, { perStudy: 1 });
    expect(new Set(top.map((p) => p.pmid)).size).toBe(top.length);
    expect(top.map((p) => p.pmid).sort()).toEqual(['111', '222']);
  });

  it('returns nothing for empty queries, unknown studies or k=0', () => {
    expect(store.bestPassages('the of and', ['111'], 3)).toEqual([]);
    expect(store.bestPassages('iron', ['999'], 3)).toEqual([]);
    expect(store.bestPassages('iron', ['111'], 0)).toEqual([]);
    expect(store.bestPassages('quantum chromodynamics', ['111'], 3)).toEqual([]);
  });

  it('builds attribution for the UI', () => {
    expect(store.attribution('111')).toEqual({
      pmid: '111',
      pmcid: 'PMC111',
      licence: 'CC BY',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      pmcUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC111/',
      label: 'Full text · CC BY',
      text: 'Doe J, Roe R, et al. Daily oral iron supplementation during pregnancy. Full text from PubMed Central (PMC111), CC BY.',
    });
    expect(store.attribution('222')).toBeNull();
  });
});

describe('default (lazy) store', () => {
  afterEach(() => setFulltextStoreForTests(null));

  it('module-level helpers use the injected store', async () => {
    setFulltextStoreForTests(createFulltextStore(CHUNKS, INDEX));
    expect(chunksForPmids(['333']).map((c) => c.id)).toEqual(['333#1']);
    expect(hasFulltext('111')).toBe(true);
    expect(fulltextAttribution('111')?.label).toBe('Full text · CC BY');
    expect(bestPassages('gestational diabetes exercise', ['333', '111'], 2)[0].id).toBe('333#1');

    // re-rank hook: reverse the BM25 order
    const opts = { perStudy: 4 };
    const bm25 = await bestPassagesReranked('iron anaemia', ['111'], 4, (_q, cands) => cands.map((_c, i) => -i), opts);
    const reversed = await bestPassagesReranked('iron anaemia', ['111'], 4, (_q, cands) => cands.map((_c, i) => i), opts);
    expect(bm25.length).toBeGreaterThan(1);
    expect(reversed.map((p) => p.id)).toEqual([...bm25.map((p) => p.id)].reverse());
    const plain = await bestPassagesReranked('iron anaemia', ['111'], 2);
    expect(plain.map((p) => p.id)).toEqual(bestPassages('iron anaemia', ['111'], 2).map((p) => p.id));
  });

  it('the reranker decides the order', async () => {
    setFulltextStoreForTests(createFulltextStore(CHUNKS, INDEX));
    const out = await bestPassagesReranked('iron', ['111'], 1, (_q, cands) => cands.map((c) => (c.section === 'Discussion' ? 10 : 0)));
    expect(out[0].section).toBe('Discussion');
  });

  it('loads the generated files (or an empty store) without throwing', () => {
    const store = getFulltextStore();
    const items = Object.entries(store.index.items);
    for (const [pmid, e] of items.slice(0, 20)) {
      expect(store.chunksForPmids([pmid])).toHaveLength(e.chunks);
      expect(['CC0', 'CC BY', 'CC BY-SA']).toContain(e.licence);
      expect(e.pmcUrl).toMatch(/^https:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC\d+\/$/);
    }
  });
});

describe('formatPassagesForPrompt', () => {
  it('tags passages with the chat source number when known', () => {
    const store = createFulltextStore(CHUNKS, INDEX);
    const text = formatPassagesForPrompt(store.bestPassages('iron anaemia', ['111'], 1), (p) => (p === '111' ? 2 : undefined));
    expect(text).toContain('[2] (full text, Results, CC BY)');
    expect(formatPassagesForPrompt([])).toBe('');
  });
});
