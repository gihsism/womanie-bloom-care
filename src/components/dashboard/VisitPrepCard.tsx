import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, Copy, Check, ExternalLink } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { onHealthDataChange } from '@/lib/data-events';
import { differenceInDays, format, parseISO } from 'date-fns';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import type { LifeStage } from './DashboardHeader';
import { getFriendlyName } from '@/lib/medical-utils';

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
  const navigate = useNavigate();
  const ctx = useUserHealthContext();

  const [flagged, setFlagged] = useState<FlaggedRow[]>([]);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [upcomingApt, setUpcomingApt] = useState<{ scheduled_at: string; doctor_name: string | null } | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const lsCheckedKey = user ? `womanie_visit_prep_checked_${user.id}` : null;

  useEffect(() => {
    if (!lsCheckedKey) return;
    try {
      const raw = localStorage.getItem(lsCheckedKey);
      if (raw) setChecked(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [lsCheckedKey]);

  const persistChecked = (next: Record<string, boolean>) => {
    setChecked(next);
    if (lsCheckedKey) {
      try { localStorage.setItem(lsCheckedKey, JSON.stringify(next)); } catch { /* ignore */ }
    }
  };

  const load = useCallback(async () => {
    if (!user) return;
    const [flaggedRes, signalsRes, aptResp] = await Promise.all([
      db.from('current_extracted_data')
        .select('title, value, unit, status, date_recorded')
        .eq('user_id', user.id)
        .eq('data_type', 'lab_result')
        .in('status', ['critical', 'abnormal', 'borderline']),
      db.from('daily_health_signals')
        .select('signal_date, symptoms, notes')
        .eq('user_id', user.id)
        .gte('signal_date', format(new Date(Date.now() - 60 * 86_400_000), 'yyyy-MM-dd')),
      fetch('/api/me/appointments?upcoming=true')
        .then(r => (r.ok ? r.json() : { appointments: [] }))
        .catch(() => ({ appointments: [] })),
    ]);
    setFlagged((flaggedRes.data ?? []) as FlaggedRow[]);
    setSignals((signalsRes.data ?? []) as SignalRow[]);
    const apts = Array.isArray(aptResp?.appointments) ? aptResp.appointments : [];
    const next = apts.find((a: { scheduled_at: string }) => Date.parse(a.scheduled_at) > Date.now());
    setUpcomingApt(next ?? null);
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
      const sev = (a.status === 'critical' ? 0 : 1) - (b.status === 'critical' ? 0 : 1);
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
        text: `I\'ve been logging "${label}" on ${topSymptom[1]} days in the last 60. Is that worth investigating?`,
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

    return out.slice(0, 6);
  }, [flagged, signals, ctx, mode]);

  if (!loaded) return null;
  if (questions.length === 0) return null;

  const totalChecked = questions.filter(q => checked[q.id]).length;
  const allChecked = totalChecked === questions.length;

  const handleCopy = async () => {
    const text = questions.map(q => `• ${q.text}`).join('\n');
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
      <div className="flex items-center gap-2 mb-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Questions for your next visit</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {totalChecked}/{questions.length}
        </Badge>
      </div>

      {upcomingApt && (
        <p className="text-[11px] text-muted-foreground mb-3">
          Next visit: {format(parseISO(upcomingApt.scheduled_at), 'EEE MMM d, h:mm a')}
          {upcomingApt.doctor_name && ` with ${upcomingApt.doctor_name}`}
          {' '}({differenceInDays(parseISO(upcomingApt.scheduled_at), new Date())} days away)
        </p>
      )}

      <ul className="space-y-2 mb-3">
        {questions.map(q => {
          const isChecked = !!checked[q.id];
          return (
            <li key={q.id} className="flex items-start gap-2">
              <button
                type="button"
                className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded border ${isChecked ? 'bg-primary border-primary' : 'border-border'} flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                onClick={() => persistChecked({ ...checked, [q.id]: !isChecked })}
                aria-label={isChecked ? 'Mark as not asked' : 'Mark as asked'}
              >
                {isChecked && <Check className="h-3 w-3 text-primary-foreground" />}
              </button>
              <p className={`text-xs leading-snug flex-1 ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                {q.text}
              </p>
              <button
                type="button"
                className="text-[10px] text-primary hover:underline opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5 flex-shrink-0"
                onClick={() => navigate(`/dashboard/ai-doctor?q=${encodeURIComponent(q.text)}`)}
                title="Ask the AI assistant first"
              >
                Ask AI
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => navigate('/dashboard/print-health-record')}>
          <ExternalLink className="h-3.5 w-3.5" />
          Print full record
        </Button>
      </div>

      {allChecked && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-3">
          All questions asked — great visit prep!
        </p>
      )}
    </Card>
  );
}
