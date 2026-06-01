import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { Brain, RotateCcw, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

// Edinburgh Postnatal Depression Scale (EPDS) — a 10-item validated
// screening tool for postpartum and antenatal depression. Each item
// scored 0–3; total 0–30. ≥10 suggests possible depression, ≥13 likely.
//
// We surface this for postpartum mode (and offer it for pregnancy
// mode too, since EPDS is validated antenatally) as a brief
// self-screen, persisted in localStorage with the date taken. Every
// run lets the patient see their score, an interpretation band, and
// (critically) flags item-10 self-harm thoughts as an immediate
// "call a clinician" cue regardless of total score.
//
// Source: Cox JL, Holden JM, Sagovsky R. Detection of postnatal
// depression. Development of the 10-item Edinburgh Postnatal
// Depression Scale. Br J Psychiatry 1987;150:782–786.

interface EpdsScreenerProps {
  mode: 'postpartum' | 'pregnancy' | string;
}

interface EpdsResult {
  date: string; // yyyy-MM-dd
  answers: number[]; // length 10, each 0..3
  total: number;
  flaggedItem10: boolean;
}

const STORAGE_KEY = (userId: string) => `womanie_epds_history_${userId}`;

// EPDS question + 4-option scale per item. Items 1, 2, 4 are
// positive-worded (reverse-scored, options in 0..3 ascending);
// items 3, 5–10 are negative-worded (descending 3..0).
interface Question {
  text: string;
  options: string[]; // index 0 (best) → 3 (worst) in NATURAL reading order
  reverse: boolean; // if true, score = index; if false, score = 3 - index
}

const QUESTIONS: Question[] = [
  {
    text: 'I have been able to laugh and see the funny side of things',
    options: ['As much as I always could', 'Not quite so much now', 'Definitely not so much now', 'Not at all'],
    reverse: true,
  },
  {
    text: 'I have looked forward with enjoyment to things',
    options: ['As much as I ever did', 'Rather less than I used to', 'Definitely less than I used to', 'Hardly at all'],
    reverse: true,
  },
  {
    text: 'I have blamed myself unnecessarily when things went wrong',
    options: ['No, never', 'Not very often', 'Yes, some of the time', 'Yes, most of the time'],
    reverse: false,
  },
  {
    text: 'I have been anxious or worried for no good reason',
    options: ['No, not at all', 'Hardly ever', 'Yes, sometimes', 'Yes, very often'],
    reverse: false,
  },
  {
    text: 'I have felt scared or panicky for no very good reason',
    options: ['No, not at all', 'No, not much', 'Yes, sometimes', 'Yes, quite a lot'],
    reverse: false,
  },
  {
    text: 'Things have been getting on top of me',
    options: ['No, I have been coping as well as ever', 'No, most of the time I have coped quite well', 'Yes, sometimes I haven\'t been coping as well as usual', 'Yes, most of the time I haven\'t been able to cope at all'],
    reverse: false,
  },
  {
    text: 'I have been so unhappy that I have had difficulty sleeping',
    options: ['No, not at all', 'Not very often', 'Yes, sometimes', 'Yes, most of the time'],
    reverse: false,
  },
  {
    text: 'I have felt sad or miserable',
    options: ['No, not at all', 'Not very often', 'Yes, quite often', 'Yes, most of the time'],
    reverse: false,
  },
  {
    text: 'I have been so unhappy that I have been crying',
    options: ['No, never', 'Only occasionally', 'Yes, quite often', 'Yes, most of the time'],
    reverse: false,
  },
  {
    text: 'The thought of harming myself has occurred to me',
    options: ['Never', 'Hardly ever', 'Sometimes', 'Yes, quite often'],
    reverse: false,
  },
];

function scoreQuestion(q: Question, optionIndex: number): number {
  return q.reverse ? optionIndex : (3 - optionIndex);
}

function interpretation(total: number, item10Flag: boolean): {
  band: 'low' | 'borderline' | 'possible' | 'likely';
  label: string;
  message: string;
  color: string;
} {
  if (item10Flag) {
    return {
      band: 'likely',
      label: 'Item 10 flagged · urgent',
      message: 'Any answer above "Never" on item 10 (thoughts of self-harm) is taken seriously regardless of total. Please reach out to a clinician today — your OB, midwife, or a crisis line.',
      color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100 border-red-300',
    };
  }
  if (total < 10) {
    return {
      band: 'low',
      label: `${total}/30 — low likelihood`,
      message: 'Score below the EPDS screening threshold (≥10). Doesn\'t rule out distress; check in again in 2 weeks if you have concerns.',
      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    };
  }
  if (total < 13) {
    return {
      band: 'possible',
      label: `${total}/30 — possible depression`,
      message: 'EPDS ≥10 is the standard cutoff for "possible postnatal depression." A conversation with your OB or GP is the right next step.',
      color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    };
  }
  return {
    band: 'likely',
    label: `${total}/30 — likely depression`,
    message: 'EPDS ≥13 strongly suggests postnatal depression. Please contact your OB, GP, or a mental health clinician this week.',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-100',
  };
}

export default function EpdsScreener({ mode }: EpdsScreenerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [history, setHistory] = useState<EpdsResult[]>([]);
  const [taking, setTaking] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(Array(10).fill(null));

  useEffect(() => {
    if (!user) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(user.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed.filter(r => r?.date && typeof r?.total === 'number' && Array.isArray(r?.answers)));
      }
    } catch { /* ignore */ }
  }, [user]);

  const persist = (next: EpdsResult[]) => {
    if (!user) return;
    try { window.localStorage.setItem(STORAGE_KEY(user.id), JSON.stringify(next)); } catch { /* ignore */ }
    setHistory(next);
  };

  const handleSubmit = () => {
    if (answers.some(a => a === null)) {
      toast({ variant: 'destructive', title: 'Please answer every question.' });
      return;
    }
    const final = answers as number[];
    const total = QUESTIONS.reduce((sum, q, i) => sum + scoreQuestion(q, final[i]), 0);
    const flaggedItem10 = scoreQuestion(QUESTIONS[9], final[9]) > 0;
    const result: EpdsResult = {
      date: format(new Date(), 'yyyy-MM-dd'),
      answers: final,
      total,
      flaggedItem10,
    };
    persist([result, ...history].slice(0, 20));
    setTaking(false);
    setAnswers(Array(10).fill(null));
    const r = interpretation(total, flaggedItem10);
    toast({
      title: r.label,
      description: r.band === 'low' ? 'Saved. Check in again in a couple of weeks.' : 'Saved. Please review the result and consider reaching out.',
      variant: r.band === 'likely' ? 'destructive' : 'default',
    });
  };

  const latest = history[0] ?? null;
  const lastInterp = useMemo(() => latest ? interpretation(latest.total, latest.flaggedItem10) : null, [latest]);

  if (mode !== 'postpartum' && mode !== 'pregnancy') return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Brain className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Mood self-check (EPDS)</p>
          <p className="text-[11px] text-muted-foreground">
            Edinburgh Postnatal Depression Scale · 10 questions, 2 minutes
          </p>
        </div>
        {!taking && (
          <Button size="sm" onClick={() => setTaking(true)} variant={latest ? 'outline' : 'default'}>
            {latest ? <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Retake</> : <>Start <ChevronRight className="h-3.5 w-3.5 ml-1" /></>}
          </Button>
        )}
      </div>

      {!taking && latest && lastInterp && (
        <div className={`rounded-lg border p-3 ${lastInterp.color}`}>
          <p className="text-xs font-semibold">{lastInterp.label}</p>
          <p className="text-[11px] mt-1 leading-relaxed">{lastInterp.message}</p>
          <p className="text-[10px] mt-2 opacity-75">Taken {format(parseISO(latest.date), 'MMM d, yyyy')}</p>
        </div>
      )}

      {!taking && !latest && (
        <p className="text-xs text-muted-foreground">
          A brief, evidence-based screen for postnatal (and antenatal) depression. Your responses
          stay on this device — nothing leaves the app.
        </p>
      )}

      {taking && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Thinking about the <span className="font-medium text-foreground/80">past 7 days</span>, choose the option closest to how you've felt.
          </p>
          {QUESTIONS.map((q, qi) => (
            <div key={qi} className="space-y-1.5">
              <p className="text-xs font-medium">
                <span className="text-muted-foreground mr-1">{qi + 1}.</span>
                {q.text}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => setAnswers(prev => prev.map((v, i) => (i === qi ? oi : v)))}
                    className={`text-[11px] px-2 py-1 rounded border ${
                      answers[qi] === oi
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card hover:bg-muted/50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleSubmit} disabled={answers.some(a => a === null)}>
              Score it
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setTaking(false); setAnswers(Array(10).fill(null)); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!taking && history.length > 1 && (
        <details className="mt-3">
          <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
            Previous screens ({history.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {history.slice(0, 8).map((h, i) => (
              <li key={i} className="text-[11px] flex items-center gap-2">
                <span className="text-muted-foreground w-24">{format(parseISO(h.date), 'MMM d, yyyy')}</span>
                <span className="font-mono">{h.total}/30</span>
                {h.flaggedItem10 && <span className="text-red-600">· item 10 flagged</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Reference: Cox JL, Holden JM, Sagovsky R (1987). EPDS is a screening tool, not a diagnosis.
        If you're in crisis, contact a clinician or emergency services.
      </p>
    </Card>
  );
}
