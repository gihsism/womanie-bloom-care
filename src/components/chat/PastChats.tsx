import { format } from 'date-fns';
import { ChevronRight, Loader2, Trash2 } from '@/components/icons';
import { chatDeleteTarget, type PastChat } from '@/lib/chatSessions';

// The "Past chats" list on Ask AI. Every stored message is still on the
// server; this only lists them grouped into chats. Tapping one reopens it.
// Each row has its own delete button (the page asks to confirm); chats
// the server cannot name yet have none and go with "Delete all chats".
// The install banner stays away: it sat over "Show older chats" at the
// end of the list (Ask AI already hides it while the chat input shows).
export function PastChats<C extends PastChat>({
  chats,
  loading,
  hasMore,
  loadingEarlier,
  onOpen,
  onDelete,
  onLoadEarlier,
}: {
  chats: C[];
  loading: boolean;
  hasMore: boolean;
  loadingEarlier: boolean;
  onOpen: (chat: C) => void;
  onDelete?: (chat: C) => void;
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
    <div className="flex-1 overflow-y-auto px-4 py-4" data-testid="past-chats" data-hide-install-banner>
      {chats.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No past chats yet.</p>
      ) : (
        <div className="max-w-2xl mx-auto rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
          {chats.map((c) => (
            <div key={c.id} className="flex items-stretch">
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{c.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.startedAt ? format(c.startedAt, 'd MMM yyyy, HH:mm') : 'Earlier'} · {c.messages.length} messages
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              </button>
              {onDelete && chatDeleteTarget(c) && (
                <button
                  type="button"
                  onClick={() => onDelete(c)}
                  aria-label={`Delete chat: ${c.title}`}
                  className="tap-target flex items-center justify-center px-3 text-muted-foreground hover:text-destructive hover:bg-muted/50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
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
