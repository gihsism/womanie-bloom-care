import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { Check, ChevronDown, FileHeart, Printer } from 'lucide-react';
import {
  BIRTH_PLAN_LOCAL_KEY, BIRTH_PLAN_SECTIONS, EMPTY_PLAN, NOTE_MAX, parsePlan, planProgress, planStatusLine,
  sectionHasContent, setNote, toggleChoice, type BirthPlan, type BirthPlanSectionId,
} from '@/lib/birthPlan';

// Birth plan from week 28 (pregnancy stage page, next to the labour
// tools). A guided form: per section she ticks wishes ("I'd like to
// discuss…") and adds her own words. Saved to her account (birth_plans,
// migration 020) with a device copy in localStorage; before the migration
// is applied it simply stays on the device. "Show in my doctor's chart"
// lets a connected doctor read it (read-only) in the patient chart.
// Printable via /dashboard/birth-plan/print.

type SaveState = 'idle' | 'saving' | 'saved' | 'device';

const BirthPlanCard = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const [plan, setPlan] = useState<BirthPlan>(EMPTY_PLAN);
  const [shared, setShared] = useState(false);
  const [open, setOpen] = useState<BirthPlanSectionId | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [serverOk, setServerOk] = useState(true);
  const timer = useRef<number | null>(null);
  const latest = useRef<{ plan: BirthPlan; shared: boolean }>({ plan: EMPTY_PLAN, shared: false });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    try {
      const local = parsePlan(localStorage.getItem(BIRTH_PLAN_LOCAL_KEY(userId)));
      setPlan(local);
      latest.current = { plan: local, shared: false };
    } catch { /* private mode */ }
    void (async () => {
      const { data, error } = await db.from('birth_plans')
        .select('plan, shared_with_doctor').eq('user_id', userId).maybeSingle();
      if (cancelled) return;
      if (error) { setServerOk(false); return; }
      const row = data as { plan: unknown; shared_with_doctor: boolean | null } | null;
      if (row) {
        const p = parsePlan(row.plan);
        setPlan(p);
        setShared(row.shared_with_doctor === true);
        latest.current = { plan: p, shared: row.shared_with_doctor === true };
        try { localStorage.setItem(BIRTH_PLAN_LOCAL_KEY(userId), JSON.stringify(p)); } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const saveToAccount = useCallback(async () => {
    if (!userId) return;
    if (!serverOk) { setSaveState('device'); return; }
    setSaveState('saving');
    const { plan: p, shared: s } = latest.current;
    const { error } = await db.from('birth_plans').upsert(
      { user_id: userId, plan: JSON.stringify(p), shared_with_doctor: s, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    setSaveState(error ? 'device' : 'saved');
  }, [userId, serverOk]);

  // A change still waiting for its debounce is saved now, not dropped:
  // typing a note and tapping "Print or save PDF" (or leaving the page)
  // within the debounce lost the note from the account and the printout.
  const saveRef = useRef(saveToAccount);
  saveRef.current = saveToAccount;
  const flushPending = useCallback(async () => {
    if (!timer.current) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    await saveRef.current();
  }, []);
  useEffect(() => () => { void flushPending(); }, [flushPending]);

  const update = (nextPlan: BirthPlan, nextShared = shared, delay = 800) => {
    setPlan(nextPlan);
    setShared(nextShared);
    latest.current = { plan: nextPlan, shared: nextShared };
    if (!userId) return;
    try { localStorage.setItem(BIRTH_PLAN_LOCAL_KEY(userId), JSON.stringify(nextPlan)); } catch { /* ignore */ }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; void saveToAccount(); }, delay);
  };

  const progress = planProgress(plan);
  const percent = Math.round((progress.done / progress.total) * 100);

  return (
    <Card className="p-4 space-y-3" data-testid="birth-plan-card">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <FileHeart className="h-4 w-4 text-primary" />
          Birth plan
        </h4>
        <Badge variant="outline" className="text-[10px]">{planStatusLine(plan)}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Your wishes for the birth, to talk through with your Hebamme and doctor. Tick what fits,
        add your own words, and change it any time. Plans can change on the day; that's normal.
      </p>

      <div className="space-y-1">
        <Progress value={percent} className="h-2" />
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {BIRTH_PLAN_SECTIONS.map(section => {
          const isOpen = open === section.id;
          const filled = sectionHasContent(plan, section.id);
          const picked = new Set(plan.choices[section.id] ?? []);
          return (
            <li key={section.id}>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : section.id)}
              >
                <span className="flex items-center gap-2">
                  {filled
                    ? <Check className="h-3.5 w-3.5 text-primary" aria-label="Filled in" />
                    : <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" aria-hidden="true" />}
                  <span className="font-medium">{section.title}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2.5">
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {section.options.map(o => {
                      const on = picked.has(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => update(toggleChoice(plan, section.id, o.id))}
                          className={`rounded-full border px-3 py-1.5 text-xs text-left transition-colors ${
                            on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/80 hover:bg-muted/50'
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  <Textarea
                    value={plan.notes[section.id] ?? ''}
                    onChange={e => update(setNote(plan, section.id, e.target.value))}
                    placeholder={section.notePrompt}
                    maxLength={NOTE_MAX}
                    rows={2}
                    className="text-sm"
                    aria-label={`${section.title}: your own words`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {serverOk ? (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={shared}
            onCheckedChange={v => update(plan, v === true, 0)}
            aria-label="Show in my doctor's chart"
            className="mt-0.5"
          />
          <span>
            Show in my doctor's chart
            <span className="block text-xs text-muted-foreground">
              Doctors you connected with can read it, not change it. Untick to hide it again.
            </span>
          </span>
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">Saved on this device. Sharing with your doctor will be available soon.</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground" aria-live="polite">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'device' ? 'Saved on this device' : ''}
        </span>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={async () => { await flushPending(); navigate('/dashboard/birth-plan/print'); }}>
          <Printer className="h-3.5 w-3.5" />
          Print or save PDF
        </Button>
      </div>
    </Card>
  );
};

export default BirthPlanCard;
