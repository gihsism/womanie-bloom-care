import { describe, it, expect } from 'vitest';
import { parseQuestions, fromSuggestions, addQuestion, toggleAsked, removeQuestion, MAX_QUESTIONS } from './visitQuestions';

describe('visit questions', () => {
  it('parses stored JSONB, parsed or as a string, and drops junk', () => {
    const rows = [{ id: 'a', text: ' Is my TSH ok? ', asked: true }, { text: '' }, null, { id: 'a', text: 'dup' }, { text: 'No id' }];
    expect(parseQuestions(rows)).toEqual([
      { id: 'a', text: 'Is my TSH ok?', asked: true },
      { id: 'q:No id', text: 'No id', asked: false },
    ]);
    expect(parseQuestions(JSON.stringify(rows))).toHaveLength(2);
    expect(parseQuestions('not json')).toEqual([]);
    expect(parseQuestions(null)).toEqual([]);
  });

  it('saving the suggestions keeps the ticks made before saving', () => {
    expect(fromSuggestions([{ id: 'x', text: 'X?' }, { id: 'y', text: 'Y?' }], { y: true }))
      .toEqual([{ id: 'x', text: 'X?', asked: false }, { id: 'y', text: 'Y?', asked: true }]);
  });

  it('adds her own question, trimmed, without duplicates or past the cap', () => {
    const one = addQuestion([], '  Can I   travel? ', 1);
    expect(one).toEqual([{ id: 'own:1', text: 'Can I travel?', asked: false }]);
    expect(addQuestion(one, 'can i travel?', 2)).toBe(one);
    expect(addQuestion(one, '   ', 2)).toBe(one);
    const full = Array.from({ length: MAX_QUESTIONS }, (_, i) => ({ id: String(i), text: `Q${i}`, asked: false }));
    expect(addQuestion(full, 'One more', 3)).toBe(full);
  });

  it('ticks and removes by id', () => {
    const l = [{ id: 'a', text: 'A', asked: false }, { id: 'b', text: 'B', asked: false }];
    expect(toggleAsked(l, 'b')[1].asked).toBe(true);
    expect(removeQuestion(l, 'a')).toEqual([l[1]]);
  });
});
