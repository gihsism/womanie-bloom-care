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

  it('shows at most 3 suggestions, based on the life stage', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText('Is my pregnancy progressing normally?')).toBeInTheDocument());
    const chips = screen.getByTestId('suggestions').querySelectorAll('button');
    expect(chips.length).toBeLessThanOrEqual(3);
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
