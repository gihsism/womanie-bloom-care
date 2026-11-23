import { format } from 'date-fns';
import { ChevronRight, Loader2 } from 'lucide-react';
import type { PastChat } from '@/lib/chatSessions';

// The "Past chats" list on Ask AI. Every stored message is still on the
// server; this only lists them grouped into chats. Tapping one reopens it.
export function PastChats({
  chats,
  loading,
  hasMore,
  loadingEarlier,
  onOpen,
  onLoadEarlier,
}: {
  chats: PastChat[];
  loading: boolean;
  hasMore: boolean;
  loadingEarlier: boolean;
  onOpen: (chat: PastChat) => void;
  onLoadEarlier: () => void;
}) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading past chats" />
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4" data-testid="past-chats">
      {chats.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No past chats yet.</p>
      ) : (
        <div className="max-w-2xl mx-auto rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{c.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {c.startedAt ? format(c.startedAt, 'd MMM yyyy, HH:mm') : 'Earlier'} · {c.messages.length} messages
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            type="button"
            disabled={loadingEarlier}
            onClick={onLoadEarlier}
            className="text-xs text-muted-foreground hover:text-primary px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted disabled:opacity-60"
          >
            {loadingEarlier ? 'Loading…' : 'Show older chats'}
          </button>
        </div>
      )}
    </div>
  );
}
