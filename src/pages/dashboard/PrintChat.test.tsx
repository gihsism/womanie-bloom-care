import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Anna' } }) }));

import PrintChat from './PrintChat';

const at = (state: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/dashboard/ai-doctor/print', state }]}>
      <Routes><Route path="/dashboard/ai-doctor/print" element={<PrintChat />} /></Routes>
    </MemoryRouter>,
  );

describe('PrintChat', () => {
  it('prints the chat it was handed: questions, answers, cited sources, disclaimer', () => {
    at({ turns: [
      { role: 'user', content: 'Is iron safe?' },
      { role: 'assistant', content: 'Usually yes [1].', sources: [{ n: 1, id: 's', pmid: '1', title: 'Iron trial', source: 'BMJ', year: 2023, url: '' }] },
    ] });
    expect(screen.getByText('Is iron safe?')).toBeInTheDocument();
    expect(screen.getByText('[1] Iron trial (BMJ, 2023)')).toBeInTheDocument();
    expect(screen.getByText(/Not a substitute for advice from your doctor/)).toBeInTheDocument();
    expect(screen.getByTestId('chat-print')).toBeInTheDocument();
  });

  it('opened directly (no chat handed over) explains how to get here, no Print button', () => {
    at(null);
    expect(screen.getByText(/Open a chat in Ask AI/)).toBeInTheDocument();
    expect(screen.queryByTestId('chat-print')).toBeNull();
  });
});
