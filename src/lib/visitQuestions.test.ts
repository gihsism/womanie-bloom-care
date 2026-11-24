import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseQuestions, fromSuggestions, addQuestion, toggleAsked, removeQuestion, MAX_QUESTIONS, isFlaggedStatus, FLAGGED_STATUSES, visitDaysAway } from './visitQuestions';

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

  it('counts days to the visit in calendar days', () => {
    const now = new Date(2026, 10, 24, 18, 10); // Tue 18:10
    expect(visitDaysAway(new Date(2026, 10, 24, 19, 0), now)).toBe('today');
    expect(visitDaysAway(new Date(2026, 10, 25, 9, 0), now)).toBe('tomorrow'); // was "0 days away"
    expect(visitDaysAway(new Date(2026, 10, 27, 10, 30), now)).toBe('in 3 days'); // was "2 days away"
  });
});

describe('questions only for out-of-range results', () => {
  it('only critical and abnormal count as flagged', () => {
    expect(isFlaggedStatus('critical')).toBe(true);
    expect(isFlaggedStatus('abnormal')).toBe(true);
    for (const s of ['normal', 'borderline', 'expected', null, undefined]) expect(isFlaggedStatus(s)).toBe(false);
    expect([...FLAGGED_STATUSES]).toEqual(['critical', 'abnormal']);
  });

  it('the card asks only for flagged labs and gates every lab-derived question on the lab status', () => {
    const card = readFileSync(resolve(__dirname, '../components/dashboard/VisitPrepCard.tsx'), 'utf8');
    expect(card).toContain(".in('status', [...FLAGGED_STATUSES])");
    expect(card).not.toContain("'borderline']");
    expect(card).toContain('isFlaggedStatus(ctx.labs.tsh.status)');
    expect(card).toContain('!out.some(q => q.id === `lab:${getFriendlyName(ctx.labs.tsh!.title)}`)');
    expect(card).toContain('isFlaggedStatus(ctx.labs.amh?.status)');
    expect(card).toContain('isFlaggedStatus(ctx.labs.lh?.status)');
    expect(card).toContain('MODE_DEFAULTS[mode]');
  });
});
