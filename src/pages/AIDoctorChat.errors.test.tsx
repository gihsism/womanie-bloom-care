import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { chatErrorText } from '@/lib/chatErrors';

// Round 13: an answer that does not arrive (model timeout, rate limit,
// network loss mid-stream) shows a clear message with Try again and keeps
// her question, in streamChat and on the page.

const auth = { user: { id: 'u1', email: 'me@example.com' }, loading: false };
const health = { loaded: false, labs: {} };
const toast = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/hooks/useUserHealthContext', () => ({ useUserHealthContext: () => health }));
function chain() {
  const q: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'in']) q[k] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, bad);
  return q;
}
vi.mock('@/integrations/db/client', () => ({ db: { from: () => chain() } }));

import AIDoctorChat, { streamChat } from './AIDoctorChat';

const enc = new TextEncoder();
const chunk = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
/** A stream that sends `parts`, then closes, errors (drop) or hangs. */
function stream(parts: string[], end: 'close' | 'drop' | 'hang' = 'close') {
  let i = 0;
  // Pull-based, so a drop comes after the parts were read (an error in
  // start() would discard them still queued).
  return new ReadableStream({
    pull(c): Promise<void> | void {
      if (i < parts.length) { c.enqueue(enc.encode(parts[i++])); return undefined; }
      if (end === 'close') c.close();
      else if (end === 'drop') c.error(new TypeError('network error'));
      else return new Promise<void>(() => {});
      return undefined;
    },
  });
}

async function run(fetchImpl: () => Promise<Response>, timeouts?: { firstByteMs?: number; idleMs?: number }) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const calls: string[] = [];
  await streamChat({
    messages: [{ role: 'user', content: 'q' }],
    model: 'm',
    conversationId: 'c',
    onDelta: (t) => calls.push(`delta:${t}`),
    onDone: () => calls.push('done'),
    onError: (e, kind) => calls.push(`error:${kind}:${e}`),
    timeouts,
  });
  return calls;
}

describe('streamChat: failures end in exactly one onError with its kind', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offline (fetch rejects): network', async () => {
    const calls = await run(async () => { throw new TypeError('Failed to fetch'); });
    expect(calls).toEqual(['error:network:Could not reach Ask AI. Check your internet connection.']);
  });

  it('429: rate-limit with the server\'s own words', async () => {
    const calls = await run(async () => json({ error: "You've reached today's chat limit (150). Try again in 42 minutes." }, 429));
    expect(calls).toEqual(["error:rate-limit:You've reached today's chat limit (150). Try again in 42 minutes."]);
  });

  it('504 from the server: timeout', async () => {
    const calls = await run(async () => json({ error: 'Ask AI took too long to answer. Please try again.' }, 504));
    expect(calls[0]).toMatch(/^error:timeout:/);
  });

  it('503 / 500: server', async () => {
    expect((await run(async () => json({ error: 'Ask AI is busy or unavailable right now.' }, 503)))[0]).toBe('error:server:Ask AI is busy or unavailable right now.');
    expect((await run(async () => new Response('oops', { status: 500 })))[0]).toBe('error:server:Ask AI could not answer just now (error 500).');
  });

  it('no response at all within the first-byte limit: timeout', async () => {
    const calls = await run(() => new Promise<Response>(() => {}), { firstByteMs: 20 });
    expect(calls).toEqual(['error:timeout:Ask AI took too long to answer.']);
  });

  it('the stream goes silent partway: the text so far, then timeout', async () => {
    const calls = await run(async () => new Response(stream([chunk('Up to ')], 'hang'), { status: 200 }), { idleMs: 20 });
    expect(calls).toEqual(['delta:Up to ', 'error:timeout:Ask AI stopped answering partway through.']);
  });

  it('the connection drops mid-stream: network', async () => {
    const calls = await run(async () => new Response(stream([chunk('Up to ')], 'drop'), { status: 200 }));
    expect(calls).toEqual(['delta:Up to ', 'error:network:The connection dropped before the answer was finished.']);
  });

  it('the stream closes without its end marker: network', async () => {
    const calls = await run(async () => new Response(stream([chunk('Up to ')]), { status: 200 }));
    expect(calls).toEqual(['delta:Up to ', 'error:network:The connection dropped before the answer was finished.']);
  });

  it('the server reports a broken-off answer: server, with its message', async () => {
    const calls = await run(async () => new Response(stream([chunk('Up to '), `data: ${JSON.stringify({ error: { message: 'The answer stopped before it was finished. Please try again.' } })}\n\n`, 'data: [DONE]\n\n']), { status: 200 }));
    expect(calls).toEqual(['delta:Up to ', 'error:server:The answer stopped before it was finished. Please try again.']);
  });

  it('[DONE] with no text at all: server', async () => {
    const calls = await run(async () => new Response(stream(['data: [DONE]\n\n']), { status: 200 }));
    expect(calls).toEqual(['error:server:Ask AI could not answer just now.']);
  });

  it('a complete answer: done, no error', async () => {
    const calls = await run(async () => new Response(stream([chunk('Hi.'), 'data: [DONE]\n\n']), { status: 200 }));
    expect(calls).toEqual(['delta:Hi.', 'done']);
  });
});

describe('chatErrorText', () => {
  it('one clear title per kind', () => {
    expect(chatErrorText('timeout', 'x').title).toBe('Ask AI took too long to answer');
    expect(chatErrorText('rate-limit', 'Try again in 42 minutes.')).toEqual({ title: 'Ask AI needs a short break', detail: 'Try again in 42 minutes.' });
    expect(chatErrorText('network', 'The connection dropped.').title).toBe('Connection lost');
    expect(chatErrorText('server', '').detail).toBe('Please try again.');
  });
});

describe('Ask AI page: message, Try again, her question kept', () => {
  let chatResponses: Array<() => Response | Promise<Response>> = [];
  let chatBodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    toast.mockClear();
    chatResponses = [];
    chatBodies = [];
    Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/ai-doctor-chat')) {
        chatBodies.push(JSON.parse(String(init?.body)));
        const next = chatResponses.shift();
        return next ? next() : json({ error: 'no more' }, 500);
      }
      if (url.startsWith('/api/chat/messages')) return json({ messages: [], hasMore: false });
      return json({});
    });
  });

  const renderPage = () => render(
    <MemoryRouter initialEntries={['/dashboard/ai-doctor']}>
      <Routes><Route path="/dashboard/ai-doctor" element={<AIDoctorChat />} /></Routes>
    </MemoryRouter>,
  );
  const ask = (text: string) => {
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  };

  it('rate limit: message with the server wording, question back in the box, Try again sends it once', async () => {
    chatResponses.push(() => json({ error: "You've reached today's chat limit (150). Try again in 42 minutes." }, 429));
    chatResponses.push(() => new Response(stream([chunk('Here is the answer.'), 'data: [DONE]\n\n']), { status: 200 }));
    renderPage();
    ask('Is coffee safe in pregnancy?');

    const alert = await screen.findByTestId('chat-error');
    expect(alert).toHaveAttribute('data-kind', 'rate-limit');
    expect(alert).toHaveTextContent('Ask AI needs a short break');
    expect(alert).toHaveTextContent('Try again in 42 minutes.');
    expect(screen.getByLabelText('Your question')).toHaveValue('Is coffee safe in pregnancy?');
    // Her question stays in the chat too.
    expect(screen.getAllByText('Is coffee safe in pregnancy?').length).toBeGreaterThan(0);
    expect(toast).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Here is the answer.')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-error')).toBeNull();
    expect(screen.getByLabelText('Your question')).toHaveValue('');
    // The retry carries the question once, not twice.
    expect(chatBodies[1].messages.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['Is coffee safe in pregnancy?']);
  });

  it('network loss mid-stream: the half answer is marked, Try again replaces it', async () => {
    chatResponses.push(() => new Response(stream([chunk('Up to 200 mg ')], 'drop'), { status: 200 }));
    chatResponses.push(() => new Response(stream([chunk('Up to 200 mg of caffeine a day.'), 'data: [DONE]\n\n']), { status: 200 }));
    renderPage();
    ask('How much coffee is OK?');

    const alert = await screen.findByTestId('chat-error');
    expect(alert).toHaveAttribute('data-kind', 'network');
    expect(alert).toHaveTextContent('Connection lost');
    expect(screen.getByText(/Answer interrupted/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your question')).toHaveValue('How much coffee is OK?');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Up to 200 mg of caffeine a day.')).toBeInTheDocument();
    expect(screen.queryByText(/Answer interrupted/)).toBeNull();
    expect(chatBodies[1].messages).toEqual([{ role: 'user', content: 'How much coffee is OK?' }]);
  });

  it('model timeout (504): clear message, and a new question she types replaces the failed one', async () => {
    chatResponses.push(() => json({ error: 'Ask AI took too long to answer. Please try again.' }, 504));
    chatResponses.push(() => new Response(stream([chunk('Answer two.'), 'data: [DONE]\n\n']), { status: 200 }));
    renderPage();
    ask('First question?');

    const alert = await screen.findByTestId('chat-error');
    expect(alert).toHaveAttribute('data-kind', 'timeout');
    expect(alert).toHaveTextContent('Ask AI took too long to answer');
    expect(alert).toHaveTextContent('Your question is kept');

    ask('Reworded question?');
    expect(await screen.findByText('Answer two.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('chat-error')).toBeNull());
    expect(chatBodies[1].messages).toEqual([{ role: 'user', content: 'Reworded question?' }]);
  });
});
