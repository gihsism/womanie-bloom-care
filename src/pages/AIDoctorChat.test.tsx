import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

// Stable objects: a new user object per render would re-run every [user] effect forever.
const auth = { user: { id: 'u1', email: 'me@example.com' }, loading: false };
const health = { loaded: false, labs: {} };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useUserHealthContext', () => ({ useUserHealthContext: () => health }));

// Any db chain resolves to "no rows", except the profile, which is pregnant.
function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'in']) q[k] = () => q;
  q.maybeSingle = () => Promise.resolve(result);
  q.single = () => Promise.resolve(result);
  q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
  return q;
}
vi.mock('@/integrations/db/client', () => ({
  db: {
    from: (table: string) =>
      chain(table === 'profiles' ? { data: { life_stage: 'pregnancy' }, error: null } : { data: [], error: null }),
  },
}));

import AIDoctorChat from './AIDoctorChat';

const stored = [
  { role: 'user', content: 'Is my TSH normal?', created_at: '2026-11-01T09:00:00Z' },
  { role: 'assistant', content: 'Your TSH of 2.1 is in range.', created_at: '2026-11-01T09:00:10Z' },
  { role: 'user', content: 'What about iron?', created_at: '2026-11-05T09:00:00Z' },
  { role: 'assistant', content: 'Your ferritin is low.', created_at: '2026-11-05T09:00:10Z' },
];

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}</div>;
}

const renderChat = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard/ai-doctor']}>
      <Routes>
        <Route path="/dashboard/ai-doctor" element={<AIDoctorChat />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );

describe('Ask AI', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => {
    vi.restoreAllMocks();
    Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/chat/messages') && (!init || !init.method || init.method === 'GET')) {
        return json({ messages: stored, hasMore: false, earliestCursor: stored[0].created_at });
      }
      return json({});
    });
  });

  it('opens on a new chat, not on the old conversation', async () => {
    renderChat();
    expect(screen.getByRole('heading', { name: 'Ask AI' })).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/chat/messages', expect.anything()));
    expect(screen.queryByText('Your ferritin is low.')).toBeNull();
    expect(screen.queryByText('Health Chat')).toBeNull();
    expect(screen.queryByText('Real Doctor')).toBeNull();
  });

  it('shows 4 suggestions, based on the life stage', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Is my pregnancy progressing normally?')).toBeInTheDocument());
    const chips = screen.getByTestId('suggestions').querySelectorAll('button');
    expect(chips.length).toBe(4);
  });

  it('long suggestions wrap instead of widening the page (IVF chip was 403px on a 390px phone)', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByTestId('suggestions')).toBeInTheDocument());
    for (const chip of screen.getByTestId('suggestions').querySelectorAll('button')) {
      expect(chip.className).toMatch(/\bwhitespace-normal\b/);
      expect(chip.className).toMatch(/\bmax-w-full\b/);
    }
  });

  it('lists every old conversation under Past chats, and each one opens', async () => {
    renderChat();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /past chats/i }));
    const list = await screen.findByTestId('past-chats');
    expect(list).toHaveTextContent('What about iron?');
    expect(list).toHaveTextContent('Is my TSH normal?');
    fireEvent.click(screen.getByText('Is my TSH normal?'));
    expect(screen.getByText('Your TSH of 2.1 is in range.')).toBeInTheDocument();
    expect(screen.queryByTestId('past-chats')).toBeNull();
    // and back to a fresh chat
    fireEvent.click(screen.getByRole('button', { name: /new chat/i }));
    expect(screen.queryByText('Your TSH of 2.1 is in range.')).toBeNull();
  });

  it('never deletes stored chats on open, new chat or browsing history', async () => {
    renderChat();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /past chats/i }));
    fireEvent.click(await screen.findByText('What about iron?'));
    fireEvent.click(screen.getByRole('button', { name: /new chat/i }));
    const deletes = fetchSpy.mock.calls.filter(([, init]: [unknown, RequestInit | undefined]) => init?.method === 'DELETE');
    expect(deletes).toHaveLength(0);
  });

  it('deletes one past chat after a confirm, by its row ids, and keeps the others', async () => {
    const withIds = stored.map((m, i) => ({ ...m, id: `00000000-0000-4000-8000-00000000000${i}` }));
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/chat/messages') && (!init?.method || init.method === 'GET')) {
        return json({ messages: withIds, hasMore: false, earliestCursor: withIds[0].created_at });
      }
      return json({ deleted: 2 });
    });
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderChat();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /past chats/i }));
    await screen.findByTestId('past-chats');
    const del = screen.getByRole('button', { name: 'Delete chat: Is my TSH normal?' });
    fireEvent.click(del);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep chat' })); // cancelled
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const deletes = () => fetchSpy.mock.calls.filter(([, init]: [unknown, RequestInit | undefined]) => init?.method === 'DELETE');
    expect(deletes()).toHaveLength(0);
    fireEvent.click(del);
    expect(await screen.findByText('Delete the chat "Is my TSH normal?"?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete chat' })); // confirmed
    await waitFor(() => expect(screen.queryByText('Is my TSH normal?')).toBeNull());
    expect(confirmSpy).not.toHaveBeenCalled(); // in-app dialog, never the browser's
    const [url, init] = deletes()[0] as [string, RequestInit];
    expect(url).toBe('/api/chat/conversation');
    expect(JSON.parse(String(init.body))).toEqual({ messageIds: [withIds[0].id, withIds[1].id] });
    expect(screen.getByTestId('past-chats')).toHaveTextContent('What about iron?');
  });

  it('after an answer: record chips, follow-up chips and a rating, all from the meta event (none in the text)', async () => {
    const MSG_ID = '3f2b8c1e-9a4d-4e6f-8b21-7c5d9e0a1b2c';
    const sse = (events: unknown[]) => new Response(
      events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/ai-doctor-chat') {
        return sse([
          { choices: [{ delta: { content: 'Your ferritin of 9 is low.' } }] },
          { meta: {
            followUps: ['What foods raise my ferritin?', 'Should I retest?'],
            records: [{ kind: 'lab', id: 'l1', label: 'Ferritin', date: '2026-06-01', href: '/dashboard/medical-history?doc=docB', count: 2 }],
            messageId: MSG_ID,
          } },
          '[DONE]',
        ]);
      }
      if (url === '/api/chat/feedback') return json({ stored: false, reason: 'not_available' });
      if (url.startsWith('/api/chat/messages')) return json({ messages: [], hasMore: false, earliestCursor: null });
      return json({});
    });
    renderChat();
    fireEvent.change(screen.getByPlaceholderText(/ask about your health records/i), { target: { value: 'Is my ferritin ok?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Your ferritin of 9 is low.');
    const followups = await screen.findByTestId('followups');
    expect(followups).toHaveTextContent('What foods raise my ferritin?');
    expect(screen.queryByText(/\[\[followups/)).toBeNull();

    // Rating before the migration: kept in the browser, no error.
    fireEvent.click(screen.getByRole('button', { name: 'Helpful answer' }));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([u]: [string]) => u === '/api/chat/feedback')).toBe(true));
    const [, fbInit] = fetchSpy.mock.calls.find(([u]: [string]) => u === '/api/chat/feedback') as [string, RequestInit];
    expect(JSON.parse(String(fbInit.body))).toMatchObject({ answerKey: MSG_ID, messageId: MSG_ID, rating: 1 });
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('womanie_chat_feedback_u1') || '[]')).toHaveLength(1));

    // The record chip opens the source report in Records.
    const chips = screen.getByTestId('record-chips');
    expect(chips).toHaveTextContent('Ferritin');
    fireEvent.click(chips.querySelector('button')!);
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/medical-history');
  });

  it('offers a real doctor as one line under the input', () => {
    renderChat();
    fireEvent.click(screen.getByRole('button', { name: /prefer a real doctor\? book a visit/i }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/appointments');
  });

  it('keeps export, delete and the model choice behind the ⋯ menu', () => {
    renderChat();
    expect(screen.queryByRole('button', { name: /export chat/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /clear chat/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });
});
