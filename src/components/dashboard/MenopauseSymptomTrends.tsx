import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import { emitHealthDataChange, onHealthDataChange } from '@/lib/data-events';
import { format, parseISO, subDays } from 'date-fns';
import { TrendingUp, ClipboardCheck, Check, Printer, Info } from '@/components/icons';
import {
  computeMenopauseInsight,
  WINDOW_WEEKS,
  type MedicationInput,
  type MetricTrend,
  type SignalInput,
} from '@/lib/menopauseInsights';
import { mergeIntoVisitList, suggestHrtQuestions, UNSCHEDULED_VISIT_ID } from '@/lib/hrtQuestions';
import { parseQuestions } from '@/lib/visitQuestions';
import { daysBetween } from '@/lib/visitSummary';

// Menopause / post-menopause: "Your symptoms over time" (hot flushes, night
// sweats, sleep, mood, joint pain over the last 12 weeks, tied to medicine
// start/stop dates) and "Questions for your doctor about HRT", which
// pre-fills Questions to bring (visit_questions). All arithmetic and wording
// live in src/lib/menopauseInsights.ts and src/lib/hrtQuestions.ts.

interface Props {
  mode: string;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; added: number; visit: string | null }
  | { kind: 'error'; message: string };

function valueText(m: MetricTrend, v: number): string {
  if (m.kind === 'count') return `${v.toFixed(1)} a day`;
  if (m.kind === 'hours') return `${v.toFixed(1)} h a night`;
  return `${v.toFixed(1)} days a week`;
}

function Bars({ metric, eventWeek }: { metric: MetricTrend; eventWeek: number | null }) {
  const vals = metric.weekly;
  const max = metric.kind === 'hours' ? 10 : metric.kind === 'perWeek' ? 7 : Math.max(1, ...vals.map(v => v ?? 0));
  const label = vals
    .map((v, i) => `week ${i + 1}: ${v == null ? 'not logged' : valueText(metric, v)}`)
    .join(', ');
  return (
    <div className="flex items-end gap-[3px] h-8" role="img" aria-label={`${metric.label}, weekly, oldest first: ${label}`}>
      {vals.map((v, i) => (
        <div key={i} className="relative flex-1 h-full flex items-end">
          {v == null ? (
            <div className="w-full h-[3px] rounded-full bg-muted" />
          ) : (
            <div
              className={`w-full rounded-sm ${metric.improved === true ? 'bg-primary/70' : 'bg-primary/45'}`}
              style={{ height: `${Math.max(8, Math.min(100, (v / max) * 100))}%` }}
            />
          )}
          {eventWeek === i && (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function MenopauseSymptomTrends({ mode }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const ctx = useUserHealthContext();
  const [signals, setSignals] = useState<SignalInput[]>([]);
  const [meds, setMeds] = useState<MedicationInput[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });

  const load = useCallback(async () => {
    if (!user) return;
    const cutoff = format(subDays(new Date(), WINDOW_WEEKS * 7 - 1), 'yyyy-MM-dd');
    const [sRes, mRes] = await Promise.all([
      db.from('daily_health_signals')
        .select('signal_date, symptoms, mood, notes')
        .eq('user_id', user.id)
        .gte('signal_date', cutoff),
      // All medicines, stopped ones too: a stop date is part of the story.
      db.from('medications').select('*').eq('user_id', user.id),
    ]);
    setSignals((sRes.data ?? []) as SignalInput[]);
    setMeds((mRes.data ?? []) as MedicationInput[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onHealthDataChange(() => { void load(); }), [load]);

  const insight = useMemo(() => computeMenopauseInsight(signals, meds), [signals, meds]);
  const questions = useMemo(
    () => suggestHrtQuestions({ insight, medications: meds, stage: mode, age: ctx.age }),
    [insight, meds, mode, ctx.age],
  );

  if (mode !== 'menopause' && mode !== 'post-menopause') return null;
  if (!loaded) return null;

  const eventWeek = insight.event
    ? WINDOW_WEEKS - 1 - Math.floor(daysBetween(insight.event.date, new Date()) / 7)
    : null;
  const shown = insight.metrics.filter(m => m.dataDays > 0);

  const addToVisit = async () => {
    if (!user) return;
    setSave({ kind: 'saving' });
    const resp = await fetch('/api/me/appointments?upcoming=true')
      .then(r => (r.ok ? r.json() : { appointments: [] }))
      .catch(() => ({ appointments: [] }));
    const apts = Array.isArray(resp?.appointments) ? resp.appointments : [];
    const next = apts.find((a: { scheduled_at: string }) => Date.parse(a.scheduled_at) > Date.now()) as
      | { id: string | number; scheduled_at: string }
      | undefined;
    // With a booked visit the list goes to that visit (her doctor there sees
    // it); without one it waits in an unscheduled list for the print summary.
    const appointmentId = next ? String(next.id) : UNSCHEDULED_VISIT_ID;
    const { data, error } = await db.from('visit_questions')
      .select('questions')
      .eq('user_id', user.id)
      .eq('appointment_id', appointmentId)
      .maybeSingle();
    if (error) {
      setSave({ kind: 'error', message: 'Saving questions is not available yet. You can copy them for now.' });
      return;
    }
    const existing = parseQuestions((data as { questions?: unknown } | null)?.questions);
    const { list, added } = mergeIntoVisitList(existing, questions);
    const visit = next ? format(parseISO(next.scheduled_at), 'EEE d MMM') : null;
    if (added > 0) {
      const { error: upErr } = await db.from('visit_questions').upsert(
        { user_id: user.id, appointment_id: appointmentId, questions: JSON.stringify(list), updated_at: new Date().toISOString() },
        { onConflict: 'user_id,appointment_id' },
      );
      if (upErr) {
        setSave({ kind: 'error', message: 'Could not save. Check your connection and try again.' });
        return;
      }
      emitHealthDataChange();
    }
    setSave({ kind: 'done', added, visit });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(questions.map(q => `• ${q.text}`).join('\n'));
      toast({ title: 'Copied', description: 'The questions are on your clipboard.' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Your browser blocked clipboard access.' });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Your symptoms over time</h3>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">Last {WINDOW_WEEKS} weeks, from your daily logs. Each bar is one week, oldest on the left.</p>

        {insight.summary.length > 0 && (
          <ul className="space-y-1 mb-3">
            {insight.summary.map(s => (
              <li key={s} className="text-sm leading-snug">{s}</li>
            ))}
          </ul>
        )}

        {shown.length > 0 && (
          <div className="space-y-3 mb-3">
            {shown.map(m => (
              <div key={m.key} className="grid grid-cols-[7.5rem_1fr] items-end gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{m.label}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {m.before != null && m.after != null
                      ? `${m.before.toFixed(1)} → ${m.after.toFixed(1)} ${m.kind === 'count' ? 'a day' : m.kind === 'hours' ? 'h' : 'days/wk'}`
                      : `${m.dataDays} ${m.dataDays === 1 ? 'day' : 'days'} logged`}
                  </p>
                </div>
                <Bars metric={m} eventWeek={eventWeek} />
              </div>
            ))}
          </div>
        )}

        {insight.event && eventWeek != null && (
          <p className="text-[10px] text-muted-foreground mb-2 inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden="true" />
            {insight.event.kind === 'start' ? 'Started' : 'Stopped'} {insight.event.name} that week
          </p>
        )}

        <p className={`text-[11px] leading-relaxed flex items-start gap-1.5 ${insight.confidence === 'low' || insight.confidence === 'none' ? 'text-foreground' : 'text-muted-foreground'}`}>
          <Info className="h-3.5 w-3.5 mt-px flex-shrink-0" aria-hidden="true" />
          {insight.confidenceNote}
        </p>
        {insight.caveat && <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{insight.caveat}</p>}
        {insight.confidence !== 'none' && !insight.event && (
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            Add HRT or other medicines with their start date under Medicines to see changes lined up with them.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Questions for your doctor about HRT</h3>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Based on what you have logged and your medicines. These are questions to ask, not advice: your doctor knows your full history.
        </p>
        <ol className="list-decimal pl-5 space-y-1.5 mb-3">
          {questions.map(q => <li key={q.id} className="text-xs leading-snug">{q.text}</li>)}
        </ol>

        {save.kind === 'done' ? (
          <p className="text-[11px] text-primary mb-2 inline-flex items-start gap-1.5">
            <Check className="h-3.5 w-3.5 mt-px flex-shrink-0" aria-hidden="true" />
            {save.added === 0
              ? 'These questions are already in your Questions to bring.'
              : `Added ${save.added} ${save.added === 1 ? 'question' : 'questions'} to Questions to bring${save.visit ? ` for your visit on ${save.visit}` : ''}.`}
          </p>
        ) : save.kind === 'error' ? (
          <p className="text-[11px] text-destructive mb-2">{save.message}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={save.kind === 'saving'} onClick={() => void addToVisit()}>
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {save.kind === 'saving' ? 'Adding…' : 'Add to Questions to bring'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void copy()}>Copy</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" asChild>
            <Link to="/dashboard/visit-summary/print">
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              Visit summary to print
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
