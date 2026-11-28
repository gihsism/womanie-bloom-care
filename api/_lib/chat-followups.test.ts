import { describe, it, expect } from 'vitest';
import { FOLLOWUPS_CLOSE, FOLLOWUPS_OPEN, FOLLOWUPS_PROMPT, freshFollowUps, parseFollowUps, visibleWhileStreaming } from './chat-followups';

describe('freshFollowUps', () => {
  it('drops a follow-up she already asked in this chat (case and punctuation aside)', () => {
    expect(freshFollowUps(['Is coffee safe in pregnancy?', 'What about green tea?', 'Is decaf fine?'], ['is coffee safe in pregnancy', null]))
      .toEqual(['What about green tea?', 'Is decaf fine?']);
  });
  it('fewer than 2 left: no chips', () => {
    expect(freshFollowUps(['Is coffee safe in pregnancy?', 'What about green tea?'], ['Is coffee safe in pregnancy?'])).toEqual([]);
  });
  it('the prompt asks for her current stage and no repeats', () => {
    expect(FOLLOWUPS_PROMPT).toMatch(/life stage she is in now/);
    expect(FOLLOWUPS_PROMPT).toMatch(/never repeat a question she already asked/);
  });
});

const ANSWER = 'Your ferritin of 9 ng/mL is low [1]. Low iron stores are common after heavy periods.';
const tail = (lines: string[]) => `\n\n${FOLLOWUPS_OPEN}\n${lines.join('\n')}\n${FOLLOWUPS_CLOSE}`;

describe('parseFollowUps', () => {
  it('splits a well-formed tail into the answer and 2-3 questions', () => {
    const r = parseFollowUps(ANSWER + tail(['- What foods raise my ferritin?', '- Should I take iron tablets?', '- When should I retest?']));
    expect(r.text).toBe(ANSWER);
    expect(r.followUps).toEqual(['What foods raise my ferritin?', 'Should I take iron tablets?', 'When should I retest?']);
  });

  it('a missing tail: text unchanged, no chips', () => {
    expect(parseFollowUps(ANSWER)).toEqual({ text: ANSWER, followUps: [] });
    expect(parseFollowUps('')).toEqual({ text: '', followUps: [] });
    expect(parseFollowUps(undefined as unknown as string)).toEqual({ text: '', followUps: [] });
  });

  it('a cut-off tail (no closer): tail removed, no chips, no marker left', () => {
    const r = parseFollowUps(`${ANSWER}\n\n${FOLLOWUPS_OPEN}\n- What foods raise my fer`);
    expect(r.text).toBe(ANSWER);
    expect(r.followUps).toEqual([]);
    expect(r.text).not.toContain('[[');
  });

  it('a marker mid-answer with text after the block keeps every word, drops only the markers', () => {
    const raw = `${ANSWER}\n${FOLLOWUPS_OPEN}\n- Q one?\n- Q two?\n${FOLLOWUPS_CLOSE}\nPlease see your doctor if you feel faint.`;
    const r = parseFollowUps(raw);
    expect(r.followUps).toEqual([]);
    expect(r.text).toContain('Please see your doctor if you feel faint.');
    expect(r.text).toContain(ANSWER);
    expect(r.text).not.toMatch(/\[\[|\]\]/);
  });

  it('a long unclosed "tail" is really answer text: only the marker goes', () => {
    const long = 'More answer text. '.repeat(50);
    const r = parseFollowUps(`${ANSWER}\n${FOLLOWUPS_OPEN}\n${long}`);
    expect(r.text).toContain(long.trim());
    expect(r.text).not.toContain(FOLLOWUPS_OPEN);
    expect(r.followUps).toEqual([]);
  });

  it('a stray closer alone is dropped', () => {
    const r = parseFollowUps(`${ANSWER}\n${FOLLOWUPS_CLOSE}`);
    expect(r).toEqual({ text: ANSWER, followUps: [] });
  });

  it('malformed lines are skipped; fewer than 2 usable questions = no chips', () => {
    expect(parseFollowUps(ANSWER + tail(['- ok?', '- ' + 'x'.repeat(120), '- https://spam.example', '- 123'])).followUps).toEqual([]);
    expect(parseFollowUps(ANSWER + tail(['- Only one good question?'])).followUps).toEqual([]);
    expect(parseFollowUps(ANSWER + tail([])).text).toBe(ANSWER);
  });

  it('cleans bullets, numbering, markdown and citations; dedupes; caps at 3', () => {
    const r = parseFollowUps(ANSWER + tail([
      '1. **What foods raise ferritin?** [2]',
      '* What foods raise ferritin?',
      '2) Is my TSH related?',
      '• Should I retest?',
      '- One more question?',
    ]));
    expect(r.followUps).toEqual(['What foods raise ferritin?', 'Is my TSH related?', 'Should I retest?']);
  });

  it('keeps non-English questions', () => {
    const r = parseFollowUps('Antwort.' + tail(['- Welche Lebensmittel erhöhen Ferritin?', '- Wann soll ich nachtesten?']));
    expect(r.followUps).toHaveLength(2);
  });

  it('the prompt names the exact markers the parser reads', () => {
    expect(FOLLOWUPS_PROMPT).toContain(FOLLOWUPS_OPEN);
    expect(FOLLOWUPS_PROMPT).toContain(FOLLOWUPS_CLOSE);
  });
});

describe('visibleWhileStreaming', () => {
  it('shows text before the marker only', () => {
    expect(visibleWhileStreaming(`${ANSWER}\n\n${FOLLOWUPS_OPEN}\n- What`)).toBe(ANSWER);
  });
  it('holds back a partial marker at the end, then releases ordinary text', () => {
    expect(visibleWhileStreaming(`${ANSWER}\n\n[[follo`)).toBe(`${ANSWER}\n\n`);
    expect(visibleWhileStreaming(`${ANSWER} [`)).toBe(`${ANSWER} `);
    expect(visibleWhileStreaming(`${ANSWER} [1]`)).toBe(`${ANSWER} [1]`);
    expect(visibleWhileStreaming('')).toBe('');
  });
  it('streaming the full reply chunk by chunk never shows any part of the tail', () => {
    const raw = ANSWER + tail(['- What foods raise my ferritin?', '- Should I retest?']);
    let shown = '';
    let sent = 0;
    for (let i = 1; i <= raw.length; i++) {
      const v = visibleWhileStreaming(raw.slice(0, i));
      if (v.length > sent) { shown += v.slice(sent); sent = v.length; }
    }
    expect(shown.trimEnd()).toBe(ANSWER);
    expect(shown).not.toContain('[[');
  });
});
