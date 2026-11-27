import { describe, it, expect } from 'vitest';
import { addToVisitList, chatPrintTurns, chatToMarkdown, questionFromAnswer, type ChatTurn } from './chatExport';

const src = { n: 1, id: 's1', pmid: '1', title: 'Iron in pregnancy', source: 'Cochrane', year: 2024, url: 'https://x.org/1' };

describe('questionFromAnswer', () => {
  const turns: ChatTurn[] = [
    { role: 'assistant', content: 'Welcome' },
    { role: 'user', content: '  Is my **ferritin** of 12\nlow?  ' },
    { role: 'assistant', content: 'Ferritin of 12 is below the range [1]. Talk to your doctor.' },
  ];
  it('uses her question behind the answer, as plain text', () => {
    expect(questionFromAnswer(turns, 2)).toBe('Is my ferritin of 12 low?');
  });
  it('falls back to the first sentence of the answer when no question precedes it', () => {
    expect(questionFromAnswer(turns, 0)).toBe('Welcome');
    expect(questionFromAnswer([{ role: 'assistant', content: 'Ferritin is low [1]. More text.' }], 0)).toBe('Ferritin is low.');
  });
  it('null for a user turn or out of range; caps at 300 chars', () => {
    expect(questionFromAnswer(turns, 1)).toBeNull();
    expect(questionFromAnswer(turns, 9)).toBeNull();
    const long = questionFromAnswer([{ role: 'user', content: 'a'.repeat(400) }, { role: 'assistant', content: 'ok' }], 1)!;
    expect(long).toHaveLength(300);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('addToVisitList', () => {
  it('first question for a visit carries her open unscheduled questions over', () => {
    const r = addToVisitList(null, [{ id: 'u1', text: 'Old one', asked: false }, { id: 'u2', text: 'Done', asked: true }], 'New one', 1);
    expect(r.list.map(q => q.text)).toEqual(['Old one', 'New one']);
    expect(r.added).toBe(true);
    expect(r.carried).toBe(true);
  });
  it('appends to an existing visit list and skips duplicates', () => {
    const existing = JSON.stringify([{ id: 'a', text: 'New one', asked: false }]);
    const dup = addToVisitList(existing, null, 'new ONE');
    expect(dup.added).toBe(false);
    const r = addToVisitList(existing, [{ id: 'u', text: 'x', asked: false }], 'Another');
    expect(r.list.map(q => q.text)).toEqual(['New one', 'Another']);
    expect(r.carried).toBe(false);
  });
  it('empty visit and nothing unscheduled: just the one question', () => {
    const r = addToVisitList(null, null, 'Q');
    expect(r.list).toHaveLength(1);
    expect(r.carried).toBe(false);
  });
});

describe('chatPrintTurns / chatToMarkdown', () => {
  const turns: ChatTurn[] = [
    { role: 'user', content: 'Iron?' },
    { role: 'assistant', content: 'Take iron [1] and see [7].', sources: [src] },
    { role: 'assistant', content: '   ' },
  ];
  it('drops empty turns, strips unknown citations, keeps cited sources', () => {
    const p = chatPrintTurns(turns);
    expect(p).toHaveLength(2);
    expect(p[1].body).toBe('Take iron [1] and see.');
    expect(p[1].sources.map(s => s.n)).toEqual([1]);
  });
  it('markdown has the disclaimer, both roles and the sources', () => {
    const md = chatToMarkdown(turns, { exportedAt: new Date('2026-11-27T10:00:00Z'), model: 'm' });
    expect(md).toContain('not a substitute for medical advice');
    expect(md).toContain('## You\n\nIron?');
    expect(md).toContain('## Assistant\n\nTake iron [1] and see.');
    expect(md).toContain('[1] Iron in pregnancy (Cochrane, 2024) https://x.org/1');
  });
});
