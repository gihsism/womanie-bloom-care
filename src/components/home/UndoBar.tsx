import { useEffect } from 'react';
import { Check } from 'lucide-react';

// The snackbar after a one-tap log: "Kick logged · 10:42" with Undo,
// sitting just above the tab bar. Undo deletes exactly what the tap saved.

export interface UndoMessage {
  key: number;
  title: string;
  undo: (() => Promise<void>) | null;
}

const SHOW_MS = 6000;

export default function UndoBar({ msg, onClose }: { msg: UndoMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(onClose, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [msg, onClose]);

  if (!msg) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 z-50 mx-auto max-w-xl bottom-[calc(4.75rem+env(safe-area-inset-bottom))] rounded-2xl bg-foreground text-background shadow-lg px-4 py-3 flex items-center gap-3"
    >
      <span className="grid place-items-center h-7 w-7 rounded-full bg-stage-accent text-white flex-shrink-0">
        <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold leading-tight truncate">{msg.title}</p>
        <p className="text-[13px] opacity-80 leading-tight mt-0.5">Hold a tile to add details</p>
      </div>
      {msg.undo && (
        <button
          type="button"
          onClick={async () => { const u = msg.undo; onClose(); await u?.(); }}
          className="text-[17px] font-bold text-stage-head px-2 py-1 rounded-md hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-head"
        >
          Undo
        </button>
      )}
    </div>
  );
}
