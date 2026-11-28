import { useCallback, useEffect, useRef, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Feed saved ✓ [Undo]" under the buttons. With an undo it stays 8 s;
 * Undo runs once, then says "Removed." Plain confirmations go after 2.5 s.
 * Used by the baby tracker tabs and Home's baby card.
 */
export function useUndoNotice() {
  const [state, setState] = useState<{ text: string; undo?: () => Promise<unknown> } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, undo?: () => Promise<unknown>) => {
    window.clearTimeout(timer.current);
    setState({ text, undo });
    timer.current = window.setTimeout(() => setState(null), undo ? 8000 : 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const node = state ? (
    <div role="status" className="flex items-center justify-center gap-3 text-sm" data-testid="baby-notice">
      <span className="text-primary">{state.text}</span>
      {state.undo && (
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => {
          const u = state.undo as () => Promise<unknown>;
          setState(null);
          void u().then(() => show('Removed.'));
        }}>
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </Button>
      )}
    </div>
  ) : null;
  return [node, show] as const;
}
