import { useConfirm } from '@/components/ConfirmDialog';
import { unshareVisitListConfirm } from '@/lib/confirmCopy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, Copy, Check, ExternalLink, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { onHealthDataChange } from '@/lib/data-events';
import { format, parseISO } from 'date-fns';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import type { LifeStage } from './DashboardHeader';
import { getFriendlyName } from '@/lib/medical-utils';
import { currentFlagged, flagRank } from '@/lib/labFlags';
import { pushAccountData, useAccountDataVersion } from '@/lib/account-data';
import { UNSCHEDULED_VISIT_ID } from '@/lib/hrtQuestions';
import { addQuestion, fromSuggestions, parseQuestions, removeQuestion, toggleAsked, visitDaysAway, type VisitQuestion } from '@/lib/visitQuestions';

// Generates a personalised "questions to bring to your doctor"
// checklist from the user's recent data + mode. Patients
// consistently forget what they wanted to ask in the room — this
// card builds a list during the calm of dashboard browsing so
// they can copy it / mark items off live.
//
// Source signals (highest-value first):
//   • Flagged extracted labs (critical / abnormal / borderline)
//   • Mode-specific prompts (pregnancy week, postpartum stage, etc.)
//   • Recent symptom patterns
//   • Persistent / overdue tests
//
// Self-hides when there are zero questions to surface.
//
// With an upcoming visit she can save the list to that visit (table
// visit_questions, migration 012): then she edits it here (add her own,
// remove, tick when asked) and the doctor of that visit sees it read-only
// in the patient chart. Before saving, the suggestions and ticks stay on
// her device as before. If the table isn't there yet, the card behaves
// exactly as before (no save button).

interface VisitPrepCardProps {
  mode: LifeStage;
}

interface FlaggedRow {
  title: string;
  value: string | number | null;
  unit: string | null;
  status: string | null;
  date_recorded: string | null;
}

interface SignalRow {
  signal_date: string;
  symptoms: string[] | null;
  notes: string | null;
}

interface Question {
  id: string;
  text: string;
}

// Mode-specific evergreen questions to add — only when no
// more-specific question has surfaced.
const MODE_DEFAULTS: Record<string, string[]> = {
  'pre-menstrual': [
    'When should I expect my first period?',
    'Are there any signs I should keep an eye on?',
  ],
  'menstrual-cycle': [
    'Is my cycle within a healthy range?',
    'Any screenings I should be doing this year?',
  ],
  'contraception': [
    'Is my current method still the right fit?',
    'What should I know about coming off it if I plan to?',
  ],
  'conception': [
    'Are there any tests I should do before we keep trying?',
    'How long should we try before considering a fertility consult?',
  ],
  'ivf': [
    'What do my labs from this cycle tell us about next steps?',
    'Any lifestyle changes that could improve outcomes for my next attempt?',
  ],
  'pregnancy': [
    'Which prenatal screenings are upcoming?',
    'How are my symptoms compared to what is typical?',
  ],
  'postpartum': [
    'How am I doing on iron / vitamin D / overall recovery labs?',
    'What contraception options make sense for me right now?',
  ],
  'menopause': [
    'Where am I in the menopause transition?',
    'Should we discuss HRT given my symptoms?',
    'Which bone-density and cardiovascular screenings am I due for?',
  ],
  'post-menopause': [
    'What\'s my fracture / cardiovascular risk and how do we manage it?',
    'Are my current symptoms expected for my stage?',
  ],
};

export default function VisitPrepCard({ mode }: VisitPrepCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const navigate = useNavigate();
  const ctx = useUserHealthContext();

  const [flagged, setFlagged] = useState<FlaggedRow[]>([]);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [upcomingApt, setUpcomingApt] = useState<{ id: string; scheduled_at: string; doctor_name: string | null } | null>(null);
  // Saved list for the upcoming visit: null = not saved; canSave = the
  // table answered (migration applied) and there is a visit to save to.
  const [saved, setSaved] = useState<VisitQuestion[] | null>(null);
  const [canSave, setCanSave] = useState(false);
  // Questions saved before any visit was booked (e.g. from "Questions for
  // your doctor about HRT"): shown first, and moved into the visit's list
  // when she saves it.
  const [unscheduled, setUnscheduled] = useState<VisitQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const lsCheckedKey = user ? `womanie_visit_prep_checked_${user.id}` : null;

  const accountVersion = useAccountDataVersion([lsCheckedKey]);
  useEffect(() => {
    if (!lsCheckedKey) return;
    try {
      const raw = localStorage.getItem(lsCheckedKey);
      if (raw) setChecked(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [lsCheckedKey, accountVersion]);

  const persistChecked = (next: Record<string, boolean>) => {
    setChecked(next);
    if (lsCheckedKey) {
      try { localStorage.setItem(lsCheckedKey, JSON.stringify(next)); } catch { /* ignore */ }
      pushAccountData(user?.id, lsCheckedKey);
    }
  };

  const load = useCallback(async () => {
    if (!user) return;
    const [flaggedRes, signalsRes, aptResp] = await Promise.all([
      db.from('current_extracted_data')
        .select('title, value, unit, status, date_recorded')
        .eq('user_id', user.id)
        .eq('data_type', 'lab_result'),
      db.from('daily_health_signals')
        .select('signal_date, symptoms, notes')
        .eq('user_id', user.id)
        .gte('signal_date', format(new Date(Date.now() - 60 * 86_400_000), 'yyyy-MM-dd')),
      fetch('/api/me/appointments?upcoming=true')
        .then(r => (r.ok ? r.json() : { appointments: [] }))
        .catch(() => ({ appointments: [] })),
    ]);
    // Latest reading per test only (shared rule, labFlags): a TSH that was
    // high and has since been re-tested normal is no longer a question.
    setFlagged(currentFlagged((flaggedRes.data ?? []) as FlaggedRow[], { borderline: true }));
    setSignals((signalsRes.data ?? []) as SignalRow[]);
    const apts = Array.isArray(aptResp?.appointments) ? aptResp.appointments : [];
    const next = apts.find((a: { scheduled_at: string }) => Date.parse(a.scheduled_at) > Date.now());
    setUpcomingApt(next ?? null);
    const { data: unsched, error: unschedErr } = await db.from('visit_questions')
      .select('questions')
      .eq('user_id', user.id)
      .eq('appointment_id', UNSCHEDULED_VISIT_ID)
      .maybeSingle();
    setUnscheduled(!unschedErr && unsched ? parseQuestions((unsched as { questions: unknown }).questions).filter(q => !q.asked) : []);
    if (next?.id) {
      const { data, error } = await db.from('visit_questions')
        .select('questions')
        .eq('user_id', user.id)
        .eq('appointment_id', String(next.id))
        .maybeSingle();
      setCanSave(!error);
      setSaved(!error && data ? parseQuestions((data as { questions: unknown }).questions) : null);
    } else {
      setCanSave(false);
      setSaved(null);
    }
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const questions = useMemo<Question[]>(() => {
    const out: Question[] = [];

    // Flagged labs — most concrete, most useful starting questions.
    // De-dupe by friendly test name and keep the most-recent reading.
    const byTest = new Map<string, FlaggedRow>();
    for (const f of flagged) {
      const key = getFriendlyName(f.title);
      const existing = byTest.get(key);
      if (!existing) {
        byTest.set(key, f);
      } else {
        const a = existing.date_recorded ? Date.parse(existing.date_recorded) : 0;
        const b = f.date_recorded ? Date.parse(f.date_recorded) : 0;
        if (b > a) byTest.set(key, f);
      }
    }
    const sortedFlagged = [...byTest.entries()].sort(([, a], [, b]) => {
      const sev = flagRank(a.status) - flagRank(b.status);
      if (sev !== 0) return sev;
      const ta = a.date_recorded ? Date.parse(a.date_recorded) : 0;
      const tb = b.date_recorded ? Date.parse(b.date_recorded) : 0;
      return tb - ta;
    });
    for (const [name, row] of sortedFlagged.slice(0, 4)) {
      const valuePart = row.value !== null && row.value !== undefined
        ? ` (${row.value}${row.unit ? ' ' + row.unit : ''})`
        : '';
      out.push({
        id: `lab:${name}`,
        text: `My ${name}${valuePart} came back ${row.status} — what does that mean for me and do we need to act on it?`,
      });
    }

    // Lab-flag derived questions from useUserHealthContext.
    if (ctx.tshOutOfRange && ctx.labs.tsh) {
      out.push({
        id: 'ctx:tsh',
        text: `My TSH is ${ctx.labs.tsh.value} — could thyroid be affecting my cycle / energy / mood?`,
      });
    }
    if (ctx.pcosLhFshPattern) {
      out.push({
        id: 'ctx:pcos',
        text: 'My LH/FSH ratio looks like a PCOS pattern — should we work that up?',
      });
    }
    if (ctx.amhAssessment?.reserveLabel === 'diminished') {
      out.push({
        id: 'ctx:amh',
        text: `My AMH is in the diminished-reserve range for my age (${ctx.age}) — what are my options to discuss?`,
      });
    }

    // Recent symptom patterns — surface the most-logged symptom over
    // the last 60 days if it's >5 days.
    const symCounts: Record<string, number> = {};
    for (const s of signals) {
      for (const sym of s.symptoms ?? []) symCounts[sym] = (symCounts[sym] ?? 0) + 1;
    }
    const topSymptom = Object.entries(symCounts).sort((a, b) => b[1] - a[1])[0];
    if (topSymptom && topSymptom[1] >= 5) {
      const label = topSymptom[0].replace(/_/g, ' ');
      out.push({
        id: `sym:${topSymptom[0]}`,
        text: `I've been logging "${label}" on ${topSymptom[1]} days in the last 60. Is that worth investigating?`,
      });
    }

    // Mode-default questions to fill out the list if we have fewer
    // than 4 items so far.
    if (out.length < 4) {
      const defaults = MODE_DEFAULTS[mode] ?? [];
      for (const text of defaults) {
        out.push({ id: `default:${text.slice(0, 24)}`, text });
        if (out.length >= 5) break;
      }
    }

    const own = unscheduled.map(q => ({ id: q.id, text: q.text }));
    const ownTexts = new Set(own.map(q => q.text.toLowerCase()));
    return [...own, ...out.filter(q => !ownTexts.has(q.text.toLowerCase())).slice(0, 6)];
  }, [flagged, signals, ctx, mode, unscheduled]);

  // Save (or re-save) the list to the upcoming visit.
  const store = async (next: VisitQuestion[]) => {
    if (!user || !upcomingApt) return;
    const prev = saved;
    setSaved(next);
    setSaving(true);
    const { error } = await db.from('visit_questions').upsert(
      { user_id: user.id, appointment_id: String(upcomingApt.id), questions: JSON.stringify(next), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,appointment_id' },
    );
    setSaving(false);
    if (error) {
      setSaved(prev);
      toast({ variant: 'destructive', title: 'Could not save', description: 'Check your connection and try again.' });
      return;
    }
    // First save to this visit carried the unscheduled questions over: clear that list.
    if (prev === null && unscheduled.length > 0) {
      const { error: delErr } = await db.from('visit_questions').delete()
        .eq('user_id', user.id).eq('appointment_id', UNSCHEDULED_VISIT_ID);
      if (!delErr) setUnscheduled([]);
    }
  };

  const unshare = async () => {
    if (!user || !upcomingApt) return;
    if (!(await confirm(unshareVisitListConfirm()))) return;
    const { error } = await db.from('visit_questions').delete()
      .eq('user_id', user.id).eq('appointment_id', String(upcomingApt.id));
    if (error) { toast({ variant: 'destructive', title: 'Could not remove', description: 'Try again.' }); return; }
    setSaved(null);
  };

  const isSaved = saved !== null;
  // What the card shows: the saved list, or the suggestions with device ticks.
  const list: VisitQuestion[] = isSaved ? saved : fromSuggestions(questions, checked);

  const addOwn = () => {
    const next = addQuestion(list, draft);
    if (next === list) return;
    setDraft('');
    void store(next);
  };

  if (!loaded) return null;
  if (list.length === 0 && !isSaved) return null;

  const totalChecked = list.filter(q => q.asked).length;
  const allChecked = list.length > 0 && totalChecked === list.length;

  const handleCopy = async () => {
    const text = list.map(q => `• ${q.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: 'Copied', description: 'Your visit-prep questions are on your clipboard.' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Your browser blocked clipboard access.' });
    }
  };

  return (
    <Card className="p-4">
    {confirmDialog}
      <div className="flex items-center gap-2 mb-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Questions for your next visit</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {totalChecked}/{list.length}
        </Badge>
      </div>

      {upcomingApt && (
        <p className="text-[11px] text-muted-foreground mb-3">
          Next visit: {format(parseISO(upcomingApt.scheduled_at), 'EEE MMM d, h:mm a')}
          {upcomingApt.doctor_name && ` with ${upcomingApt.doctor_name}`}
          {' '}({visitDaysAway(parseISO(upcomingApt.scheduled_at))})
        </p>
      )}

      <ul className="space-y-2 mb-3">
        {list.map(q => {
          const isChecked = q.asked;
          return (
            <li key={q.id} className="flex items-start gap-2">
              <button
                type="button"
                className={`relative before:absolute before:-inset-3 before:content-[''] flex-shrink-0 mt-0.5 h-4 w-4 rounded border ${isChecked ? 'bg-primary border-primary' : 'border-border'} flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                onClick={() => (isSaved ? void store(toggleAsked(saved, q.id)) : persistChecked({ ...checked, [q.id]: !isChecked }))}
                aria-label={isChecked ? 'Mark as not asked' : 'Mark as asked'}
              >
                {isChecked && <Check className="h-3 w-3 text-primary-foreground" />}
              </button>
              <p className={`text-xs leading-snug flex-1 ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                {q.text}
              </p>
              <button
                type="button"
                className="tap-target text-[10px] text-primary hover:underline opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5 flex-shrink-0"
                onClick={() => navigate(`/dashboard/ai-doctor?q=${encodeURIComponent(q.text)}`)}
                title="Ask the AI assistant first"
              >
                Ask AI
              </button>
              {isSaved && (
                <button
                  type="button"
                  className="tap-target flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => void store(removeQuestion(saved, q.id))}
                  aria-label={`Remove question: ${q.text}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {canSave && upcomingApt && (
        <div className="mb-3 space-y-2">
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addOwn(); }}>
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Add your own question"
              aria-label="Add your own question"
              maxLength={300}
              className="h-8 text-xs"
            />
            <Button type="submit" size="sm" variant="outline" className="h-8 gap-1" disabled={!draft.trim() || saving}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </form>
          {isSaved ? (
            <p className="text-[11px] text-muted-foreground">
              Saved to your visit on {format(parseISO(upcomingApt.scheduled_at), 'EEE MMM d')}. Your doctor can see this list.{' '}
              <button type="button" className="underline hover:text-foreground" onClick={unshare}>Remove from visit</button>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" disabled={saving} onClick={() => void store(list)}>
                <ClipboardCheck className="h-3.5 w-3.5" />
                Save for my visit
              </Button>
              <p className="text-[11px] text-muted-foreground">Your doctor will see the saved list before the visit.</p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        {upcomingApt ? (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => navigate(`/dashboard/appointments/${upcomingApt.id}/prep`)}>
            <ExternalLink className="h-3.5 w-3.5" />
            Prep sheet
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => navigate('/dashboard/health-record/print')}>
            <ExternalLink className="h-3.5 w-3.5" />
            Print full record
          </Button>
        )}
      </div>

      {allChecked && (
        <p className="text-[11px] text-primary mt-3">
          All questions asked — great visit prep!
        </p>
      )}
    </Card>
  );
}
