import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const auth = { user: { id: 'u1', email: 'me@example.com' }, loading: false };
const health = { loaded: false, labs: {} };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useUserHealthContext', () => ({ useUserHealthContext: () => health }));

const upserts: Array<Record<string, unknown>> = [];
const deletes: string[] = [];
let visitRows: Array<{ appointment_id: string; questions: unknown }> = [];
function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'in']) q[k] = () => q;
  const result = table === 'visit_questions' ? { data: visitRows, error: null } : { data: [], error: null };
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
  q.upsert = (row: Record<string, unknown>) => { upserts.push(row); return Promise.resolve({ error: null }); };
  q.delete = () => { deletes.push(table); return q; };
  return q;
}
vi.mock('@/integrations/db/client', () => ({ db: { from: (t: string) => chain(t) } }));

import AIDoctorChat from './AIDoctorChat';

const stored = [
  { role: 'user', content: 'Is my ferritin low?', created_at: '2026-11-05T09:00:00Z', conversation_id: 'c1' },
  { role: 'assistant', content: 'Your ferritin of 12 is below the range.', created_at: '2026-11-05T09:00:10Z', conversation_id: 'c1' },
];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Ask AI: Ask my doctor about this', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    upserts.length = 0;
    deletes.length = 0;
    Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/chat/messages')) return json({ messages: stored, hasMore: false });
      if (url.startsWith('/api/me/appointments')) return json({ appointments: [{ id: 42, scheduled_at: '2099-12-02T09:00:00Z' }] });
      return json({});
    });
  });

  it('saves her question to the next visit and carries the unscheduled ones over', async () => {
    visitRows = [{ appointment_id: 'unscheduled', questions: [{ id: 'u', text: 'Earlier question', asked: false }] }];
    render(
      <MemoryRouter initialEntries={['/dashboard/ai-doctor']}>
        <Routes><Route path="/dashboard/ai-doctor" element={<AIDoctorChat />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /past chats/i }));
    fireEvent.click(await screen.findByText('Is my ferritin low?'));
    // Not on the welcome line, only on the real answer.
    const buttons = screen.getAllByTestId('ask-doctor');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0].appointment_id).toBe('42');
    expect(JSON.parse(String(upserts[0].questions)).map((q: { text: string }) => q.text)).toEqual(['Earlier question', 'Is my ferritin low?']);
    await waitFor(() => expect(deletes).toEqual(['visit_questions']));
    expect(await screen.findByText('In Questions to bring')).toBeInTheDocument();
  });
});
