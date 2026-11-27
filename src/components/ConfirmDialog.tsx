import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

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
}

/**
 * `const [confirm, confirmDialog] = useConfirm();`
 * Render `{confirmDialog}` once, then `if (!(await confirm({...}))) return;`
 * Resolves true on the confirm button; false on the back-out button,
 * Escape, or a tap outside.
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    // A second request while one is open answers the first with "no".
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>(resolve => { resolver.current = resolve; });
  }, []);

  const dialog = (
    <AlertDialog open={opts !== null} onOpenChange={open => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description ? <AlertDialogDescription>{opts.description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{opts?.cancelLabel ?? 'Go back'}</AlertDialogCancel>
          <AlertDialogAction
            className={opts?.destructive ? buttonVariants({ variant: 'destructive' }) : undefined}
            onClick={() => settle(true)}
          >
            {opts?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog] as const;
}
