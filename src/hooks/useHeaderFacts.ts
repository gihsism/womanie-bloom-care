import { useEffect, useState } from 'react';
import { differenceInDays, format, subDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { cycleDial, dayOfLife, hotFlushes, monthsSince, pillFromNotes, pillRing } from '@/lib/bodyMap';
import { getWeekData } from '@/components/dashboard/pregnancyWeekData';
import { IVF_PHASES } from '@/components/dashboard/ivfPhases';
import { deviceTz } from '@/components/dashboard/ivf/ivfFormat';
import { daysBetween as ivfDaysBetween, ivfStatus, localDate, nextKeyDate } from '@/lib/ivfJourney';
import { useIvfPlan } from './useIvfPlan';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import type { HeaderFacts } from '@/lib/stageHeader';
import type { TodaySignals } from '@/lib/todayItems';
import { kicksTodayCount, type QuickLogState } from '@/lib/quickLog/state';
import { useCycleModel } from './useCycleModel';
import type { Med } from './useQuickLog';
import type { PeriodData } from './useStageProfile';

// Gathers the few facts Home's coloured header shows, per stage, from the
// same sources the old heroes read (cycle model, pill notes, hot-flush
// notes, the baby, the IVF phase). Read-only.

interface Input {
  mode: LifeStage;
  userId: string;
  stageName: string;
  periodData: PeriodData | null;
  dueDate: Date | null;
  ivfStartDate: Date | null;
  ivfPhase: string | null;
  signals: TodaySignals;
  quick: QuickLogState;
  meds: Med[];
}

const CYCLE: LifeStage[] = ['menstrual-cycle', 'conception', 'pre-menstrual'];

export function useHeaderFacts(i: Input): HeaderFacts {
  const { mode, userId } = i;
  const isCycle = CYCLE.includes(mode);
  const { prediction: p, loaded, periodRecords } = useCycleModel(isCycle);
  // Her clinic's dates (ivf_plans), when she entered them, beat the phase she picked by hand.
  const { plan: ivfPlan } = useIvfPlan({ enabled: mode === 'ivf' });
  const [notes, setNotes] = useState<{ signal_date: string; notes: string | null }[]>([]);
  const [lastPeriod, setLastPeriod] = useState<Date | null>(null);
  const [baby, setBaby] = useState<{ name: string | null; birth_date: string | null } | null>(null);
  const [lastFeedAt, setLastFeedAt] = useState<string | null>(null);
  const [lastSymptom, setLastSymptom] = useState<{ name: string; date: Date } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const load = async () => {
      if (mode === 'contraception' || mode === 'menopause' || mode === 'post-menopause') {
        const days = mode === 'contraception' ? 60 : 7;
        const [sig, per] = await Promise.all([
          db.from('daily_health_signals').select('signal_date, notes').eq('user_id', userId).gte('signal_date', format(subDays(new Date(), days), 'yyyy-MM-dd')),
          mode === 'contraception' ? Promise.resolve({ data: [] })
            : db.from('period_tracking').select('period_start_date').eq('user_id', userId).order('period_start_date', { ascending: false }).limit(1),
        ]);
        if (!alive) return;
        setNotes(((sig.data as { signal_date: string; notes: string | null }[] | null) ?? []).map(r => ({ ...r, signal_date: String(r.signal_date).slice(0, 10) })));
        const lp = (per.data as { period_start_date: string }[] | null)?.[0]?.period_start_date;
        setLastPeriod(lp ? new Date(`${String(lp).slice(0, 10)}T00:00:00`) : null);
      }
      if (mode === 'pre-menstrual') {
        // Before a first period: the last symptom she logged (last 90 days).
        const { data } = await db.from('daily_health_signals').select('signal_date, symptoms').eq('user_id', userId)
          .gte('signal_date', format(subDays(new Date(), 90), 'yyyy-MM-dd')).order('signal_date', { ascending: false }).limit(30);
        if (!alive) return;
        const row = ((data as { signal_date: string; symptoms: string[] | null }[] | null) ?? []).find(r => (r.symptoms?.length ?? 0) > 0);
        setLastSymptom(row ? { name: row.symptoms![row.symptoms!.length - 1], date: new Date(`${String(row.signal_date).slice(0, 10)}T00:00:00`) } : null);
      }
      if (mode === 'postpartum') {
        const { data } = await db.from('babies').select('id, name, birth_date').eq('user_id', userId).order('created_at', { ascending: true }).limit(1);
        const b = ((data as { id: string; name: string | null; birth_date: string | null }[] | null) ?? [])[0] ?? null;
        let last: string | null = null;
        if (b) {
          const { data: f } = await db.from('life_events').select('occurred_at').eq('user_id', userId).eq('kind', 'feed').eq('baby_id', b.id)
            .order('occurred_at', { ascending: false }).limit(1);
          last = ((f as { occurred_at: string }[] | null) ?? [])[0]?.occurred_at ?? null;
        }
        if (!alive) return;
        setBaby(b); setLastFeedAt(last);
      }
    };
    void load();
    const off = onHealthDataChange(() => { void load(); });
    return () => { alive = false; off(); };
  }, [mode, userId]);

  const now = new Date();
  const facts: HeaderFacts = {
    now,
    stageName: i.stageName,
    nextVisit: i.signals.appointmentToday ?? i.signals.nextVisit ?? null,
    loggedToday: (i.quick.row.symptoms?.length ?? 0) + (i.quick.row.mood?.length ?? 0) + i.quick.events.length,
  };

  if (mode === 'pregnancy') {
    facts.dueDate = i.dueDate;
    facts.kicksToday = kicksTodayCount(i.quick, now);
    if (i.dueDate) {
      const week = Math.floor((now.getTime() - (i.dueDate.getTime() - 280 * 86400000)) / (7 * 86400000));
      facts.babySize = getWeekData(Math.max(4, Math.min(40, week))).size;
    }
  }
  if (isCycle) {
    // The full personal prediction when it has loaded (as the old dial did).
    const usable = loaded && periodRecords.length > 0;
    const start = usable ? new Date(`${periodRecords[0].period_start_date}T00:00:00`) : i.periodData?.lastPeriodStart ?? null;
    facts.cycleStart = start;
    const todaySymptoms = i.quick.row.symptoms ?? [];
    facts.lastSymptom = todaySymptoms.length ? { name: todaySymptoms[todaySymptoms.length - 1], date: now } : lastSymptom;
    if (start) {
      const predictedLen = usable ? differenceInDays(p.predictedPeriodStart, start) : 0;
      const okLen = predictedLen >= 15 && predictedLen <= 60;
      const len = usable && okLen ? predictedLen : usable ? p.averageCycleLength : i.periodData?.cycleLength ?? 28;
      const ovu = usable && okLen ? differenceInDays(p.predictedOvulationDate, start) + 1 : undefined;
      facts.cycle = cycleDial(start, len, now, usable ? Math.min(p.averagePeriodLength, 8) : 5, ovu);
    }
  }
  if (mode === 'contraception') {
    const read = (k: string) => { try { const v = localStorage.getItem(`contraception:${userId}:${k}`); return v ? JSON.parse(v) : null; } catch { return null; } };
    const byDate = new Map<string, 'taken' | 'late' | 'missed'>();
    for (const r of notes) { const s = pillFromNotes(r.notes); if (s) byDate.set(r.signal_date, s); }
    const todayPill = pillFromNotes(i.quick.row.notes);
    if (todayPill) byDate.set(format(now, 'yyyy-MM-dd'), todayPill);
    const ring = pillRing(byDate, read('packStartDate'), now);
    facts.pill = { isPill: (read('method') ?? 'pill') === 'pill', packDay: ring.packDay, streak: ring.streak, takenToday: todayPill };
  }
  if (mode === 'menopause' || mode === 'post-menopause') {
    const todayKey = format(now, 'yyyy-MM-dd');
    const merged = [...notes.filter(n => n.signal_date !== todayKey), { signal_date: todayKey, notes: i.quick.row.notes }];
    const hf = hotFlushes(merged, now);
    facts.hotFlushesToday = hf.today ?? 0;
    facts.hotFlushes7 = hf.total7;
    facts.monthsSincePeriod = monthsSince(lastPeriod, now);
  }
  if (mode === 'ivf') {
    const tz = deviceTz();
    const status = ivfStatus(ivfPlan, now, tz);
    const key = nextKeyDate(ivfPlan, now, tz);
    const phase = status.phase ?? i.ivfPhase;
    const idx = IVF_PHASES.findIndex(ph => ph.key === phase);
    const day = status.stimDay
      ?? (status.phaseStart ? ivfDaysBetween(status.phaseStart, localDate(now, tz)) + 1
        : i.ivfStartDate ? differenceInDays(now, i.ivfStartDate) + 1 : null);
    if (idx >= 0 && day != null) {
      const name = (k: number) => IVF_PHASES[k].label.replace(' (TWW)', '').replace('Ovarian ', '').replace(' & Culture', '');
      const next = key
        ? `${key.label.toLowerCase()} ${key.daysUntil === 0 ? 'today' : key.daysUntil === 1 ? 'tomorrow' : `in ${key.daysUntil} days`}`
        : idx < IVF_PHASES.length - 1 ? name(idx + 1) : null;
      facts.ivf = { phase: name(idx), next, day };
    }
    const doses = i.quick.events.filter(e => e.kind === 'med_dose');
    const total = i.meds.reduce((n, m) => n + Math.max(1, m.times_per_day ?? 1), 0);
    const taken = i.meds.reduce((n, m) => n + Math.min(Math.max(1, m.times_per_day ?? 1), doses.filter(d => d.data?.medication_id === m.id).length), 0);
    facts.doses = { taken, total };
  }
  if (mode === 'postpartum' && baby) {
    const ev = i.quick.events;
    const wet = ev.filter(e => e.kind === 'nappy' && e.data?.type !== 'dirty').length;
    const dirty = ev.filter(e => e.kind === 'nappy' && e.data?.type !== 'wet').length;
    const sleepMin = ev.filter(e => e.kind === 'baby_sleep' && e.ended_at)
      .reduce((m, e) => m + Math.max(0, (Date.parse(e.ended_at!) - Date.parse(e.occurred_at)) / 60000), 0);
    const todayFeeds = ev.filter(e => e.kind === 'feed');
    const latest = [lastFeedAt ? new Date(lastFeedAt).toISOString() : null, ...todayFeeds.map(e => e.occurred_at)].filter((x): x is string => !!x).sort().pop() ?? null;
    facts.baby = {
      name: baby.name?.trim() || 'Baby',
      dayOfLife: dayOfLife(baby.birth_date, now),
      lastFeedMin: latest ? Math.max(0, Math.round((now.getTime() - Date.parse(latest)) / 60000)) : null,
      feedsToday: todayFeeds.length, wet, dirty, sleepMin,
    };
  }
  return facts;
}
