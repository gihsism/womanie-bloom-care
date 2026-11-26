import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { BookOpen, Info, Stethoscope } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import {
  computeCycleInsights,
  pregnancyBreaksFromBirths,
  PHASE_LABEL,
  type Phase,
  type PeriodLog,
  type SymptomLog,
} from '@/lib/cycleInsights';

// "Your cycle, explained" — the cycle and TTC stage pages.
// Average cycle + period length with a FIGO regularity verdict, her own
// symptom patterns by phase, a confidence note under 3 cycles, and a calm
// "worth mentioning to a doctor" line only when a FIGO threshold is
// crossed. All the logic lives in src/lib/cycleInsights.ts.

const PHASES: Phase[] = ['period', 'follicular', 'ovulation', 'luteal', 'premenstrual'];

export default function CycleExplainedCard() {
  const { user } = useAuth();
  const [periods, setPeriods] = useState<PeriodLog[]>([]);
  const [symptoms, setSymptoms] = useState<SymptomLog[]>([]);
  const [births, setBirths] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const since = format(subDays(new Date(), 400), 'yyyy-MM-dd');
    const [p, s, b, r] = await Promise.all([
      db.from('period_tracking').select('period_start_date, period_end_date')
        .eq('user_id', user.id).order('period_start_date', { ascending: false }),
      db.from('daily_health_signals').select('signal_date, symptoms')
        .eq('user_id', user.id).gte('signal_date', since),
      db.from('babies').select('birth_date').eq('user_id', user.id),
      db.from('birth_records').select('birth_at').eq('user_id', user.id),
    ]);
    const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);
    setPeriods(((p.data as PeriodLog[] | null) ?? []).map(x => ({
      period_start_date: day(x.period_start_date) ?? '',
      period_end_date: day(x.period_end_date),
    })));
    setSymptoms(((s.data as SymptomLog[] | null) ?? []).map(x => ({
      signal_date: day(x.signal_date) ?? '',
      symptoms: x.symptoms,
    })));
    const birthDays = [
      ...((b.data as { birth_date: string | null }[] | null) ?? []).map(x => day(x.birth_date)),
      ...((r.data as { birth_at: string | null }[] | null) ?? []).map(x => day(x.birth_at)),
    ].filter((x): x is string => !!x);
    setBirths(birthDays);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); return onHealthDataChange(load); }, [load]);

  const insights = useMemo(() => computeCycleInsights({
    periods,
    symptoms,
    breaks: pregnancyBreaksFromBirths(births),
    today: format(new Date(), 'yyyy-MM-dd'),
  }), [periods, symptoms, births]);

  if (!loaded || periods.length === 0) return null;

  const phaseRows = PHASES.filter(ph => insights.symptomsByPhase[ph]?.length);
  const avgCycle = insights.avgCycleLength != null ? Math.round(insights.avgCycleLength) : null;
  const avgPeriod = insights.avgPeriodLength != null ? Math.round(insights.avgPeriodLength) : null;

  return (
    <Card className="p-4" data-testid="cycle-explained">
      {/* Idea 4: the Track page row above already says "Your cycle,
          explained"; the heading stays for screen readers. */}
      <h2 className="sr-only">Your cycle, explained</h2>
      <p className="flex items-center gap-2 mb-3 text-[14px] text-muted-foreground">
        <BookOpen className="h-4 w-4 shrink-0 text-stage-accent" aria-hidden="true" />
        From the periods and symptoms you have logged
      </p>

      {(avgCycle != null || avgPeriod != null) && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat label="Average cycle" value={avgCycle != null ? `${avgCycle} days` : '—'} />
          <Stat label="Average period" value={avgPeriod != null ? `${avgPeriod} days` : '—'} />
          <Stat label="Regularity" value={insights.regularity ?? 'Too early to say'} />
        </div>
      )}

      {insights.summary && <p className="text-[15px] leading-relaxed mb-3">{insights.summary}</p>}

      {insights.symptomSentences.length > 0 && (
        <ul className="mb-3 space-y-1">
          {insights.symptomSentences.map(s => (
            <li key={s.key} className="text-[15px] leading-relaxed">{s.sentence}</li>
          ))}
        </ul>
      )}

      {phaseRows.length > 0 && (
        <div className="mb-3">
          <p className="text-[13px] text-muted-foreground mb-1.5">Most common symptoms in each part of your cycle</p>
          <dl className="space-y-1">
            {phaseRows.map(ph => (
              <div key={ph} className="flex flex-wrap gap-x-2 text-[14px]">
                <dt className="font-medium text-foreground/80">{PHASE_LABEL[ph]}:</dt>
                <dd className="text-muted-foreground">
                  {insights.symptomsByPhase[ph]!.map(r => `${r.label} (${r.count} ${r.count === 1 ? 'day' : 'days'})`).join(', ')}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {insights.confidenceNote && (
        <p className="text-xs flex items-start gap-1.5 text-muted-foreground mb-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{insights.confidenceNote}</span>
        </p>
      )}

      {insights.skippedGaps > 0 && (
        <p className="text-[11px] text-muted-foreground mb-2">
          We left out {insights.skippedGaps === 1 ? 'one long gap' : `${insights.skippedGaps} long gaps`} between logged periods, since a period may simply not have been logged.
        </p>
      )}

      {insights.doctorLine && (
        <div className="mt-2 rounded-xl bg-stage-tint p-3" data-testid="cycle-doctor-line">
          <p className="text-[14px] flex items-start gap-1.5">
            <Stethoscope className="h-4 w-4 mt-0.5 flex-shrink-0 text-stage-accent" aria-hidden="true" />
            <span>
              {insights.doctorFlags.map(f => f.text).join(' ')} {insights.doctorLine}
            </span>
          </p>
        </div>
      )}

      <p className="text-[12px] text-muted-foreground mt-3 leading-relaxed">
        Typical ranges follow FIGO (the international gynaecology federation): cycles of 24–38 days, varying by up to 7–9 days, and periods of up to 8 days. A general guide, not a diagnosis.
      </p>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-xl border border-line bg-card">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="text-[15px] font-bold">{value}</p>
    </div>
  );
}
