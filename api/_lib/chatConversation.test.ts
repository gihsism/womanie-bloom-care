import { describe, it, expect, vi } from 'vitest';
import { parseConversationId, persistChatTurn } from './chatConversation';

const ID = '3f2b8c1e-9a4d-4e6f-8b21-7c5d9e0a1b2c';

type Q = { text: string; values: unknown[] };

// Minimal stand-in for neon(): records tagged-template inserts (as
// {text, values}) and sql.query calls, so tests can read what was stored.
function fakeSql(opts: { missingColumn?: boolean } = {}) {
  const writes: Q[] = [];
  const fail = (text: string) => Boolean(opts.missingColumn) && /conversation_id/.test(text);
  const missing = () => Object.assign(new Error('column "conversation_id" does not exist'), { code: '42703' });
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Q => ({ text: strings.join('$'), values });
  const transaction = vi.fn(async (qs: Q[]) => {
    if (qs.some((q) => fail(q.text))) throw missing();
    writes.push(...qs);
    return [];
  });
  const query = vi.fn(async (text: string, values: unknown[]) => {
    if (fail(text)) throw missing();
    writes.push({ text, values });
    return [];
  });
  const sql = Object.assign(tag, { transaction, query });
  return { sql: sql as unknown as Parameters<typeof persistChatTurn>[0], writes, transaction };
}

describe('parseConversationId', () => {
  it('keeps a well-formed UUID (lower-cased)', () => {
    expect(parseConversationId(ID)).toBe(ID);
    expect(parseConversationId(ID.toUpperCase())).toBe(ID);
  });
  it('drops anything else', () => {
    for (const v of [undefined, null, 42, '', 'abc', `${ID}'; DROP TABLE chat_messages;--`, { id: ID }]) {
      expect(parseConversationId(v)).toBeNull();
    }
  });
});

describe('persistChatTurn', () => {
  const turn = { userId: 'user_me', conversationId: ID, userText: 'Is my TSH normal?', assistantText: 'Yes ...', model: 'm' };

  it('stores the same conversation id on the user and the assistant row, owned by the session user', async () => {
    const { sql, writes } = fakeSql();
    await persistChatTurn(sql, turn);
    expect(writes).toHaveLength(2);
    for (const w of writes) {
      expect(w.text).toMatch(/conversation_id/);
      expect(w.values).toContain(ID);
      expect(w.values[0]).toBe('user_me');
    }
    expect(writes[0].text).toMatch(/'user'/);
    expect(writes[1].text).toMatch(/'assistant'/);
  });

  it('an assistant-only turn also carries the id', async () => {
    const { sql, writes } = fakeSql();
    await persistChatTurn(sql, { ...turn, userText: null });
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toEqual(['user_me', 'assistant', 'Yes ...', 'm', ID]);
  });

  it('before migration 013: still saves both rows, without the id', async () => {
    const { sql, writes } = fakeSql({ missingColumn: true });
    await persistChatTurn(sql, turn);
    expect(writes).toHaveLength(2);
    for (const w of writes) {
      expect(w.text).not.toMatch(/conversation_id/);
      expect(w.values[0]).toBe('user_me');
    }
  });

  it('other errors are passed on, not retried', async () => {
    const { sql, transaction } = fakeSql();
    transaction.mockRejectedValueOnce(new Error('down'));
    await expect(persistChatTurn(sql, turn)).rejects.toThrow('down');
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
