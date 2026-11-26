import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('PastChats — delete one chat', () => {
  it('each chat the server can name has its own delete button; old chats without row ids have none', () => {
    const onDelete = vi.fn();
    const onOpen = vi.fn();
    const withId = { id: 'c1', conversationId: '0f8fad5b-d9cb-469f-a165-70867728950e', startedAt: null, title: 'Is coffee OK?', messages: [{ role: 'user' as const, content: 'Is coffee OK?' }] };
    const legacyIds = { id: 'l1', conversationId: null, startedAt: null, title: 'Old chat', messages: [{ id: 'm1', role: 'user' as const, content: 'Old chat' }] };
    const legacyNoIds = { id: 'l2', conversationId: null, startedAt: null, title: 'Imported', messages: [{ role: 'user' as const, content: 'Imported' }] };
    render(
      <PastChats chats={[withId, legacyIds, legacyNoIds]} loading={false} hasMore={false} loadingEarlier={false}
        onOpen={onOpen} onDelete={onDelete} onLoadEarlier={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete chat: Is coffee OK?' }));
    expect(onDelete).toHaveBeenCalledWith(withId);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete chat: Old chat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete chat: Imported' })).toBeNull();
  });
});
