import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLibrary } from './library';
import { createFulltextStore, setFulltextStoreForTests, type FulltextChunk } from './fulltext';

const items = getLibrary().items.slice(0, 2);
vi.mock('./hybrid.js', () => ({ selectChatSourcesHybrid: vi.fn(async () => items) }));

import { CHAT_PASSAGE_MIN_SCORE, buildChatSystemPrompt, selectChatEvidence } from './chat-prompt';

const chunk = (pmid: string, n: number, text: string): FulltextChunk => ({
  id: `${pmid}#${n}`,
  pmid,
  pmcid: `PMC${pmid}`,
  section: 'Results',
  text,
  licence: 'CC BY',
});

afterEach(() => setFulltextStoreForTests(null));

describe('chat evidence', () => {
  it('numbers the sources and puts the rules and passages in the system prompt', async () => {
    const [a, b] = items;
    // Many unrelated chunks keep the idf of the query words high.
    const filler = Array.from({ length: 40 }, (_, i) => chunk('999', i + 1, `unrelated text number ${i} about something else`));
    setFulltextStoreForTests(
      createFulltextStore([
        chunk(a.pmid, 1, 'zebra quokka zebra quokka narwhal okapi axolotl'),
        chunk(b.pmid, 1, 'a passage that shares only the word okapi'),
        ...filler,
      ]),
    );
    const ev = await selectChatEvidence('zebra quokka narwhal okapi axolotl', 'pregnancy');
    expect(ev.chatSources.map((s) => s.n)).toEqual([1, 2]);
    // The strong match is kept, the one-word match falls under the floor.
    expect(ev.passages.map((p) => p.pmid)).toEqual([a.pmid]);
    expect(ev.passages[0].score).toBeGreaterThanOrEqual(CHAT_PASSAGE_MIN_SCORE);
    const prompt = buildChatSystemPrompt('Patient: T, Life stage: pregnancy\n\n', ev.block);
    expect(prompt).toContain(`[1] ${a.title}`);
    expect(prompt).toMatch(/\[1\] \(full text, Results, CC BY\)/);
    expect(prompt).toMatch(/Name the subject in every cited sentence/);
    expect(prompt).toMatch(/Put each number straight after the words its source supports/);
  });

  it('has no passages and no-sources wording when nothing matches', async () => {
    setFulltextStoreForTests(createFulltextStore([]));
    const ev = await selectChatEvidence('', null);
    expect(ev.passages).toEqual([]);
    expect(buildChatSystemPrompt('', ev.block)).toMatch(/No medical records available yet/);
  });
});
