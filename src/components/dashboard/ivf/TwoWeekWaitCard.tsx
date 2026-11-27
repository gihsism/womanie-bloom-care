import { useMemo, useState } from 'react';
import { Hourglass } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useLifeEvents } from '@/hooks/useLifeEvents';
import { TWW_SYMPTOMS, groupSymptomLog, twoWeekWait, type IvfPlan } from '@/lib/ivfJourney';
import { fmtDay } from './ivfFormat';

// Two-week wait (after the embryo transfer, until test day): a day
// counter, a gentle note on early home tests, and a symptom log that only
// records (life_events kind 'tww_symptom'), never scores or interprets.

interface SymptomData { symptoms: string[]; note?: string }

interface Props { plan: IvfPlan; tz: string; now: Date }

export default function TwoWeekWaitCard({ plan, tz, now }: Props) {
  const wait = useMemo(() => twoWeekWait(plan, now, tz), [plan, now, tz]);
  const { events, add, error } = useLifeEvents<SymptomData>('tww_symptom', { limit: 60 });
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const days = useMemo(() => {
    const since = plan.transfer ?? null;
    return groupSymptomLog(events, tz).filter(d => !since || d.date >= since);
  }, [events, tz, plan.transfer]);

  const toggle = (s: string) => setPicked(p => (p.includes(s) ? p.filter(x => x !== s) : [...p, s]));
  const save = async () => {
    if (!picked.length && !note.trim()) return;
    setSaving(true);
    const saved = await add({ occurred_at: new Date().toISOString(), data: { symptoms: picked, ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}) } });
    setSaving(false);
    if (saved) { setPicked([]); setNote(''); }
  };

  return (
    <Card className="p-4 space-y-4" id="ivf-tww" data-testid="ivf-tww">
      <h4 className="font-semibold flex items-center gap-2">
        <Hourglass className="h-4 w-4 text-primary" />
        Two-week wait
      </h4>

      {wait ? (
        <div className="space-y-2">
          <p className="font-display text-[34px] leading-none">
            Day {wait.day} <span className="text-muted-foreground text-[20px]">after transfer</span>
          </p>
          {wait.daysToTest != null && plan.testDate ? (
            <>
              <p className="text-sm" data-testid="ivf-days-to-test">
                {wait.daysToTest === 1 ? 'Test day is tomorrow' : `${wait.daysToTest} days to your test day`} · {fmtDay(plan.testDate)}
              </p>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                <div className="h-full bg-primary" style={{ width: `${Math.round((wait.progress ?? 0) * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Add the test date from your clinic in the timeline above to see the days left.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {plan.transfer ? 'The day counter starts tomorrow, the day after your transfer. Rest as your clinic advised.' : 'Add your transfer date in the timeline above and the day counter starts the day after.'}
        </p>
      )}

      <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-1" role="note">
        <p className="font-medium">Testing early can mislead</p>
        <p className="text-muted-foreground">
          A home test before your test day can be negative simply because it is too early, or positive only because the trigger medicine is still in your body. The blood test on the day your clinic gave you is the one to go by. However you spend these days is okay.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">How are you today?</p>
        <p className="text-xs text-muted-foreground">A private note for yourself. Progesterone support can cause many of the same feelings, so this log doesn't read anything into them.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="What you notice today">
          {TWW_SYMPTOMS.map(s => (
            <button
              key={s}
              type="button"
              aria-pressed={picked.includes(s)}
              onClick={() => toggle(s)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                picked.includes(s) ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:bg-muted',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Anything else (optional)" maxLength={500} rows={2} aria-label="Note" />
        <Button size="sm" onClick={() => void save()} disabled={saving || (!picked.length && !note.trim())} data-testid="ivf-tww-save">Save</Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {days.length > 0 && (
        <ul className="space-y-2 border-t border-border pt-3" aria-label="Your notes">
          {days.slice(0, 14).map(d => (
            <li key={d.date} className="text-sm">
              <span className="label-mono mr-2">{fmtDay(d.date)}</span>
              {d.symptoms.join(', ')}
              {d.notes.length > 0 && <span className="block text-muted-foreground text-xs">{d.notes.join(' · ')}</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Call your clinic if you have strong tummy pain, a belly that swells quickly, shortness of breath or heavy bleeding. Out of hours, use your clinic's emergency number, or 144 in an emergency.
      </p>
    </Card>
  );
}
