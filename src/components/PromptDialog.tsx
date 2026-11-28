import { useCallback, useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';

// An in-app text question ("Rename document"). Replaces window.prompt,
// which installed iOS web apps can suppress. Same AlertDialog pieces as
// ConfirmDialog: no new styling.

export interface PromptOptions {
  title: string;
  description?: string;
  /** Visible label of the text field, e.g. "Document name". */
  label: string;
  /** Text the field starts with (e.g. the current name). */
  defaultValue?: string;
  /** Label of the button that saves, e.g. "Rename". */
  confirmLabel: string;
  cancelLabel?: string;
}

/**
 * `const [ask, promptDialog] = usePrompt();`
 * Render `{promptDialog}` once, then `const text = await ask({...});`
 * Resolves the trimmed text on the confirm button (or Enter); null on the
 * back-out button, Escape, or a tap outside. Empty text cannot be saved.
 */
export function usePrompt() {
  const [opts, setOpts] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((text: string | null) => void) | null>(null);

  const settle = useCallback((text: string | null) => {
    resolver.current?.(text);
    resolver.current = null;
    setOpts(null);
  }, []);

  const ask = useCallback((o: PromptOptions) => {
    resolver.current?.(null);
    setValue(o.defaultValue ?? '');
    setOpts(o);
    return new Promise<string | null>(resolve => { resolver.current = resolve; });
  }, []);

  const trimmed = value.trim();

  const dialog = (
    <AlertDialog open={opts !== null} onOpenChange={open => { if (!open) settle(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description ? <AlertDialogDescription>{opts.description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <form
          className="space-y-2"
          onSubmit={e => { e.preventDefault(); if (trimmed) settle(trimmed); }}
        >
          <label htmlFor="prompt-dialog-text" className="text-sm text-muted-foreground">{opts?.label}</label>
          <Input
            id="prompt-dialog-text"
            value={value}
            onChange={e => setValue(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(null)}>{opts?.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
          <AlertDialogAction disabled={!trimmed} onClick={() => settle(trimmed)}>
            {opts?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [ask, dialog] as const;
}
