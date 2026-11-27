import { useMemo, useState } from 'react';
import { CalendarDays, Pencil } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  hasAnyDate, ivfStatus, ivfTimeline, nextKeyDate, planIssues, type IvfPlan,
} from '@/lib/ivfJourney';
import type { IvfSaveState } from '@/hooks/useIvfPlan';
import { fmtDay, fmtMoment, inDays } from './ivfFormat';

// IVF timeline (stage page): the steps of this treatment cycle with the
// dates her clinic gave her, where she is today, stim day N and the next
// key date. She sets / edits the dates here; the trigger-shot time is set
// in the trigger timer card below (#ivf-trigger), because it needs a time.

type DateField = 'downregStart' | 'stimStart' | 'retrieval' | 'transfer' | 'testDate';

const FIELDS: Array<{ key: DateField; label: string; hint?: string }> = [
  { key: 'downregStart', label: 'Down-regulation starts', hint: 'Only if your protocol has one (some start with the pill or an injection before stimulation).' },
  { key: 'stimStart', label: 'Stimulation day 1', hint: 'The first day of your stimulation injections.' },
  { key: 'retrieval', label: 'Egg retrieval', hint: 'Usually about 36 hours after the trigger shot. Your clinic confirms the time.' },
  { key: 'transfer', label: 'Embryo transfer' },
  { key: 'testDate', label: 'Test day', hint: 'The blood test date your clinic gave you, often around 9 to 14 days after the transfer.' },
];

interface Props {
  plan: IvfPlan;
  tz: string;
  now: Date;
  fallbackPhase: string | null;
  serverOk: boolean;
  saveState: IvfSaveState;
  onSave: (p: IvfPlan) => Promise<IvfSaveState>;
}

export default function IVFJourneyCard({ plan, tz, now, fallbackPhase, serverOk, saveState, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IvfPlan>(plan);
  const status = useMemo(() => ivfStatus(plan, now, tz), [plan, now, tz]);
  const steps = useMemo(() => ivfTimeline(plan, now, tz, fallbackPhase), [plan, now, tz, fallbackPhase]);
  const next = useMemo(() => nextKeyDate(plan, now, tz), [plan, now, tz]);
  const issues = planIssues(plan, tz);
  const anyDate = hasAnyDate(plan);

  const startEdit = () => { setDraft(plan); setEditing(true); };
  const save = async () => {
    await onSave({ ...plan, ...pickDates(draft) });
    setEditing(false);
  };

  return (
    <Card className="p-4 space-y-3" data-testid="ivf-journey">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Your IVF timeline
        </h4>
        {status.stimDay != null && <Badge variant="secondary" data-testid="ivf-stim-day">Stim day {status.stimDay}</Badge>}
      </div>

      {next ? (
        <p className="text-sm" data-testid="ivf-next">
          <span className="text-muted-foreground">Next: </span>
          <span className="font-medium">{next.label}</span>
          {' · '}
          {next.at ? fmtMoment(next.at, tz) : fmtDay(next.date)}
          <span className="text-muted-foreground"> · {inDays(next.daysUntil)}</span>
        </p>
      ) : !anyDate ? (
        <p className="text-sm text-muted-foreground">Add the dates from your clinic's treatment plan. The timeline, stim day and next step fill in from there.</p>
      ) : null}

      <ol className="relative ml-1" aria-label="IVF steps">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-start gap-3 pb-3 last:pb-0 relative">
            {i < steps.length - 1 && (
              <span aria-hidden="true" className={cn('absolute left-[7px] top-4 bottom-0 w-px', s.state === 'done' ? 'bg-foreground' : 'bg-border')} />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-10 mt-1 h-[15px] w-[15px] rounded-full border flex-shrink-0',
                s.state === 'done' && 'bg-foreground border-foreground',
                s.state === 'current' && 'bg-primary border-primary ring-4 ring-primary/20',
                s.state === 'upcoming' && 'bg-background border-foreground/60',
              )}
            />
            <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
              <span className={cn('text-sm', s.state === 'current' ? 'font-medium' : s.state === 'done' ? 'text-muted-foreground' : '')}>
                {s.label}
                {s.state === 'current' && <span className="sr-only"> (now)</span>}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {s.key === 'trigger' && plan.triggerAt ? fmtMoment(plan.triggerAt, tz)
                  : s.key === 'trigger' ? <a href="#ivf-trigger" className="underline">Set time</a>
                  : s.date ? fmtDay(s.date) : '—'}
              </span>
            </div>
          </li>
        ))}
      </ol>

      {issues.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="note">Please check: {issues.join('; ')}.</p>
      )}

      {!editing ? (
        <Button variant="outline" size="sm" className="gap-2" onClick={startEdit} data-testid="ivf-edit-dates">
          <Pencil className="h-3.5 w-3.5" /> {anyDate ? 'Edit dates' : 'Add your dates'}
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl bg-muted/40 p-3">
          {FIELDS.map(f => (
            <div key={f.key} className="space-y-1">
              <label htmlFor={`ivf-${f.key}`} className="text-sm font-medium">{f.label}</label>
              <Input
                id={`ivf-${f.key}`}
                type="date"
                value={draft[f.key] ?? ''}
                onChange={e => setDraft({ ...draft, [f.key]: e.target.value || null })}
              />
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Leave out any date you don't have yet. Your clinic's plan always comes first; this is your own overview.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saveState === 'saving'} data-testid="ivf-save-dates">Save dates</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {saveState === 'device' || (!serverOk && anyDate) ? (
        <p className="text-xs text-muted-foreground">Saved on this phone. It moves to your account as soon as that is available.</p>
      ) : saveState === 'saved' ? (
        <p className="text-xs text-muted-foreground">Saved to your account.</p>
      ) : null}
    </Card>
  );
}

function pickDates(p: IvfPlan): Pick<IvfPlan, DateField> {
  return { downregStart: p.downregStart, stimStart: p.stimStart, retrieval: p.retrieval, transfer: p.transfer, testDate: p.testDate };
}
