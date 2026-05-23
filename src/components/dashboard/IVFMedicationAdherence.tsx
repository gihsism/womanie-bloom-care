import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { Syringe, AlertCircle } from 'lucide-react';
import { format, subDays } from 'date-fns';

// IVF medication adherence card. Reads back the per-day "Medication:
// all-on-time / late / missed" entry that DailyLogging has been
// writing into daily_health_signals.notes for the IVF mode forever,
// but no surface ever displayed. Symmetric to the contraception pill-
// adherence calendar — same shape, different field. Critical for IVF
// because mistimed gonadotropin or trigger shots can compromise the
// cycle.

type MedStatus = 'all-on-time' | 'late' | 'missed';

const KEY_MAP: Record<MedStatus, { color: string; label: string }> = {
  'all-on-time': { color: 'bg-emerald-500', label: 'all on time' },
  late:          { color: 'bg-amber-500',   label: 'late' },
  missed:        { color: 'bg-destructive', label: 'missed' },
};

const SCAN_DAYS = 30;

function parseMedStatus(notes: string | null): MedStatus | null {
  if (!notes) return null;
  const m = notes.match(/Medication:\s*(all-on-time|late|missed)/i);
  if (!m) return null;
  return m[1].toLowerCase() as MedStatus;
}

const IVFMedicationAdherence = () => {
  const { user } = useAuth();
  const [signals, setSignals] = useState<{ date: string; status: MedStatus }[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoaded(false);
    try {
      const cutoff = format(subDays(new Date(), SCAN_DAYS + 5), 'yyyy-MM-dd');
      const { data } = await db
        .from('daily_health_signals')
        .select('signal_date, notes')
        .eq('user_id', user.id)
        .gte('signal_date', cutoff)
        .order('signal_date', { ascending: true });
      const rows = (data as { signal_date: string; notes: string | null }[]) || [];
      const parsed: { date: string; status: MedStatus }[] = [];
      for (const r of rows) {
        const status = parseMedStatus(r.notes);
        if (status) parsed.push({ date: r.signal_date, status });
      }
      setSignals(parsed);
    } catch (e) {
      console.error('IVFMedicationAdherence load error', e);
      setSignals([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const { days30, counts } = useMemo(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const map = new Map<string, MedStatus>();
    for (const s of signals) map.set(s.date, s.status);

    const days: { date: string; status: MedStatus | null; isToday: boolean }[] = [];
    for (let i = SCAN_DAYS - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      days.push({ date: d, status: map.get(d) ?? null, isToday: d === todayKey });
    }

    const c = { onTime: 0, late: 0, missed: 0, unlogged: 0 };
    for (const d of days) {
      if (d.status === 'all-on-time') c.onTime++;
      else if (d.status === 'late') c.late++;
      else if (d.status === 'missed') c.missed++;
      else c.unlogged++;
    }
    return { days30: days, counts: c };
  }, [signals]);

  if (!loaded) return null;
  // Self-hide when no medication entries have been logged. IVF users
  // who haven't started injections yet shouldn't see an empty tile
  // for a field they don't use.
  if (signals.length === 0) return null;

  const dotFor = (status: MedStatus | null): string => {
    if (!status) return 'bg-muted-foreground/20';
    return KEY_MAP[status].color;
  };

  // Surface a warning when any dose was missed in the last 7 days —
  // IVF medication timing is critical, more so than birth-control
  // pills, and a missed gonadotropin or trigger shot can compromise
  // the cycle. We don't try to identify which medication; that's the
  // user's clinic's call.
  const recentMissed = days30.slice(-7).filter(d => d.status === 'missed').length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Syringe className="h-4 w-4 text-primary" />
          Medication adherence
        </h4>
        <Badge variant="outline" className="text-[10px]">
          IVF dosing timing matters
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Last 30 days of "Medication" entries from the daily-log form.
      </p>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">All on time</div>
          <div className="font-semibold text-emerald-700 dark:text-emerald-300">{counts.onTime}</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Late</div>
          <div className="font-semibold text-amber-700 dark:text-amber-300">{counts.late}</div>
        </div>
        <div className="bg-destructive/10 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Missed</div>
          <div className="font-semibold text-destructive">{counts.missed}</div>
        </div>
      </div>

      <div className="grid grid-cols-10 sm:grid-cols-15 gap-1">
        {days30.map(d => (
          <div
            key={d.date}
            className={`aspect-square rounded-sm ${dotFor(d.status)} ${
              d.isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
            }`}
            title={`${d.date}${d.status ? ` · ${KEY_MAP[d.status].label}` : ' · not logged'}`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" /> on time
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-500" /> late
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-destructive" /> missed
          </span>
        </div>
        <span>{counts.unlogged} day{counts.unlogged === 1 ? '' : 's'} unlogged</span>
      </div>

      {recentMissed > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/30">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-destructive" />
          <p className="text-xs text-destructive">
            {recentMissed} missed dose{recentMissed === 1 ? '' : 's'} in the last 7 days. IVF
            medication timing is more sensitive than most schedules — call your clinic to
            confirm any adjustments needed.
          </p>
        </div>
      )}
    </Card>
  );
};

export default IVFMedicationAdherence;
