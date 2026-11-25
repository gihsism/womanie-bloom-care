import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PastChats } from './PastChats';

describe('PastChats', () => {
  it('keeps the install banner off the list, so "Show older chats" can be tapped', () => {
    render(
      <PastChats
        chats={[{ id: 'a', conversationId: 'a', startedAt: new Date('2026-11-24T10:00:00Z'), title: 'Is coffee OK?', messages: [{ role: 'user', content: 'Is coffee OK?' }] }]}
        loading={false}
        hasMore
        loadingEarlier={false}
        onOpen={() => {}}
        onLoadEarlier={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Show older chats' })).toBeInTheDocument();
    expect(screen.getByTestId('past-chats')).toHaveAttribute('data-hide-install-banner');
  });
});
