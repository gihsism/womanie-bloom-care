import type { MutableRefObject } from 'react';
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
import { Input } from '@/components/ui/input';
import { restoreFocus, type ConfirmOptions } from './ConfirmDialog';

// The "are you sure?" dialog of useConfirm() (ConfirmDialog.tsx), loaded on
// first use. Built from the existing AlertDialog and button variants.

export default function ConfirmDialogView({ opts, typed, setTyped, settle, returnFocus }: {
  opts: ConfirmOptions | null;
  typed: string;
  setTyped: (v: string) => void;
  settle: (ok: boolean) => void;
  returnFocus: MutableRefObject<HTMLElement | null>;
}) {
  return (
    <AlertDialog open={opts !== null} onOpenChange={open => { if (!open) settle(false); }}>
      <AlertDialogContent onCloseAutoFocus={e => { e.preventDefault(); restoreFocus(returnFocus); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description ? <AlertDialogDescription>{opts.description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {opts?.requireText ? (
          <div className="space-y-2">
            <label htmlFor="confirm-require-text" className="text-sm text-muted-foreground">
              To confirm, type exactly: <span className="font-semibold text-foreground">{opts.requireText}</span>
            </label>
            <Input
              id="confirm-require-text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{opts?.cancelLabel ?? 'Go back'}</AlertDialogCancel>
          <AlertDialogAction
            className={opts?.destructive ? buttonVariants({ variant: 'destructive' }) : undefined}
            disabled={!!opts?.requireText && typed !== opts.requireText}
            onClick={() => settle(true)}
          >
            {opts?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

}
