import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useOnceTrue } from '@/hooks/useOnceTrue';

// The dialog itself (Radix AlertDialog, focus trap, scroll lock: ~25 KB)
// downloads the first time a confirm opens, not with every screen that has
// a Cancel / Revoke / Delete button; after that it stays mounted, so closing
// animates as before. It is also fetched 2 s after the screen appears, so
// the first tap still opens it at once.
const loadView = () => import('./ConfirmDialogView');
const ConfirmDialogView = lazy(loadView);

// An in-app "are you sure?" for actions that end something (cancel a
// visit, revoke a doctor's access, decline a request, cancel a share
// code). Replaces window.confirm, which installed iOS web apps can
// suppress and which cannot name both choices. Built from the existing
// AlertDialog and button variants: no new styling.

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  /** Label of the button that goes ahead, e.g. "Cancel appointment". */
  confirmLabel: string;
  /** Label of the button that backs out, e.g. "Keep appointment". */
  cancelLabel?: string;
  /** Red confirm button for actions that remove or end something. */
  destructive?: boolean;
  /** Type-to-confirm: the confirm button stays off until she types this
   *  exact phrase (replaces window.prompt, which iOS web apps can also
   *  suppress). */
  requireText?: string;
}

/**
 * `const [confirm, confirmDialog] = useConfirm();`
 * Render `{confirmDialog}` once, then `if (!(await confirm({...}))) return;`
 * Resolves true on the confirm button; false on the back-out button,
 * Escape, or a tap outside.
 */
/** Focus the element that opened a dialog again, if it is still on the page. */
export function restoreFocus(ref: { current: HTMLElement | null }) {
  const el = ref.current;
  ref.current = null;
  if (el && el.isConnected && el !== document.body) el.focus();
}

export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  // The button that asked: focus goes back to it when the dialog closes
  // (there is no Radix trigger here, so Radix would leave focus on <body>).
  const returnFocus = useRef<HTMLElement | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    // A second request while one is open answers the first with "no".
    resolver.current?.(false);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTyped('');
    setOpts(o);
    return new Promise<boolean>(resolve => { resolver.current = resolve; });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void loadView().catch(() => { /* retried on first open */ }); }, 2000);
    return () => window.clearTimeout(t);
  }, []);
  const mounted = useOnceTrue(opts !== null);
  const dialog = mounted ? (
    <Suspense fallback={null}>
      <ConfirmDialogView opts={opts} typed={typed} setTyped={setTyped} settle={settle} returnFocus={returnFocus} />
    </Suspense>
  ) : null;

  return [confirm, dialog] as const;
}
