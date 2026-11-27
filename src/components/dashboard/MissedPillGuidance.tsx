import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ShieldCheck, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LATE_CHOICES, PILL_TYPES, SOURCES_LINE, choiceForHours, missedPillGuidance, vomitWindowHours, type PillType,
} from '@/lib/missedPill';

// The "what to do now" sheet after a late or missed pill. Rules and
// sources: src/lib/missedPill.ts (FSRH / CoSRH, CDC SPR 2024, Swiss practice). The hours are
// pre-filled from her usual pill time; she can correct them with one tap.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pillType: PillType;
  /** Hours since the pill was due, estimated from her reminder time. */
  estimatedHours: number;
  /** Pack day of the missed pill (1–28), when a pack start is known. */
  packDay: number | null;
  onChangePillType: () => void;
}

export default function MissedPillGuidance({ open, onOpenChange, pillType, estimatedHours, packDay, onChangePillType }: Props) {
  const [choice, setChoice] = useState(() => choiceForHours(estimatedHours));
  useEffect(() => { if (open) setChoice(choiceForHours(estimatedHours)); }, [open, estimatedHours]);

  const hours = LATE_CHOICES.find(c => c.id === choice)?.hours ?? estimatedHours;
  const g = useMemo(() => missedPillGuidance(pillType, hours, packDay), [pillType, hours, packDay]);
  const typeLabel = PILL_TYPES.find(t => t.id === pillType)?.label ?? 'Pill';
  const protectedNow = g.level === 'late' || g.level === 'not-late' || g.level === 'break';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="missed-pill-guidance">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {protectedNow
              ? <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              : <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />}
            {g.title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {typeLabel}{packDay != null ? ` · pack day ${packDay}` : ''} ·{' '}
            <button type="button" className="underline" onClick={onChangePillType}>change pill type</button>
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium mb-1">How late is the pill now?</legend>
          <div className="flex flex-wrap gap-1.5">
            {LATE_CHOICES.map(c => (
              <button
                key={c.id}
                type="button"
                aria-pressed={choice === c.id}
                onClick={() => setChoice(c.id)}
                className={cn(
                  'tap-target px-2.5 py-1 rounded-full border text-xs',
                  choice === c.id ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted/50',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Counted from your usual pill time.</p>
        </fieldset>

        <div>
          <p className="text-xs font-semibold mb-1.5">What to do now</p>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            {g.steps.map(s => <li key={s}>{s}</li>)}
          </ol>
        </div>

        {g.extraProtection && (
          <p className="text-sm rounded-lg border border-border bg-muted/40 p-3">
            <span className="font-medium">Extra protection: </span>{g.extraProtection}
          </p>
        )}

        {g.emergency && (
          <div className={cn('rounded-lg border p-3 text-sm', g.emergency.consider ? 'border-destructive/40' : 'border-border')}>
            <p className="font-medium mb-1">{g.emergency.consider ? 'Emergency contraception may be needed' : 'About emergency contraception'}</p>
            <p className="text-muted-foreground text-[13px] leading-snug">{g.emergency.text}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{g.footer} Vomiting within {vomitWindowHours(pillType)} hours of a pill, or severe diarrhoea, counts like a missed pill.</span>
        </p>

        <p className="text-[11px] text-muted-foreground" data-testid="missed-pill-sources">{SOURCES_LINE}</p>

        <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
      </DialogContent>
    </Dialog>
  );
}
