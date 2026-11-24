import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamChat } from './AIDoctorChat';

function sse(events: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`data: ${e}\n\n`));
      c.close();
    },
  });
}

describe('streamChat', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hands the server\'s cleaned text to onReplace after the deltas', async () => {
    const chunk = (t: string) => JSON.stringify({ choices: [{ delta: { content: t } }] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse([
      JSON.stringify({ sources: [{ n: 1, id: 'pmid-1', pmid: '1', title: 'T', source: 'S', year: 2020, url: 'https://pubmed.ncbi.nlm.nih.gov/1/' }] }),
      chunk('Gabapentin can cause '),
      chunk('dizziness [1].'),
      JSON.stringify({ replace: 'Gabapentin can cause dizziness.' }),
      '[DONE]',
    ]), { status: 200 })));
    const calls: string[] = [];
    await streamChat({
      messages: [{ role: 'user', content: 'q' }],
      model: 'm',
      conversationId: 'c',
      onDelta: (t) => calls.push(`delta:${t}`),
      onSources: (s) => calls.push(`sources:${s.length}`),
      onReplace: (t) => calls.push(`replace:${t}`),
      onDone: () => calls.push('done'),
      onError: (e) => calls.push(`error:${e}`),
    });
    expect(calls).toEqual([
      'sources:1',
      'delta:Gabapentin can cause ',
      'delta:dizziness [1].',
      'replace:Gabapentin can cause dizziness.',
      'done',
    ]);
  });
});
