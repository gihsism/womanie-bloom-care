import { DATE_FMT, DAY_MONTH_FMT } from '@/lib/dateFormat';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { Activity, AlertTriangle, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { pushAccountData, useAccountDataVersion } from '@/lib/account-data';
import EvidenceNote from '@/components/research/EvidenceNote';
import { evidenceSpec } from '@/lib/evidenceTopics';
import { healthTone } from '@/lib/medical-utils';

// Blood pressure log + preeclampsia / hypertension screen for
// pregnancy mode. ACOG 2020:
//   - Normal: <120/<80
//   - Elevated: 120–129/<80
//   - Stage 1 hypertension: 130–139 or 80–89
//   - Stage 2 hypertension: ≥140 or ≥90
//   - Severe range (pregnancy): ≥160 or ≥110 → urgent
// In pregnancy specifically, sustained ≥140/90 after 20 weeks is
// gestational hypertension and warrants OB workup; ≥160/110 is
// urgent.
//
// We don't replace clinical readings — we give the patient a
// rolling 30-day log they can show their OB at the next visit.
// LocalStorage per-user until vitals get a schema.

interface BloodPressureTrackerProps {
  // The card surfaces for pregnancy specifically (preeclampsia
  // screening), but the same widget is useful for menopause /
  // post-menopause where cardiovascular monitoring becomes a
  // priority. Caller decides.
  mode: 'pregnancy' | 'menopause' | 'post-menopause' | string;
}

interface BpEntry {
  date: string; // yyyy-MM-dd
  time?: string; // HH:mm — informational only
  systolic: number;
  diastolic: number;
  pulse?: number | null;
  note?: string;
}

const STORAGE_KEY = (userId: string) => `womanie_bp_log_${userId}`;
const SHOWN_MODES = new Set(['pregnancy', 'menopause', 'post-menopause']);

function classify(sys: number, dia: number, isPregnancy: boolean):
  { band: 'normal' | 'elevated' | 'stage1' | 'stage2' | 'severe'; label: string; color: string; urgent: boolean } {
  // Severe line: ≥160/110 in pregnancy (ACOG); outside pregnancy a
  // reading above 180/120 is "severe hypertension" (AHA/ACC 2025, which
  // kept the 2017 categories).
  if (isPregnancy ? (sys >= 160 || dia >= 110) : (sys >= 180 || dia >= 120)) {
    return {
      band: 'severe',
      label: isPregnancy ? 'Severe — call your doctor or maternity unit now' : 'Hypertensive crisis range',
      color: `${healthTone.alert.badge} font-medium`,
      urgent: true,
    };
  }
  if (sys >= 140 || dia >= 90) {
    return {
      band: 'stage2',
      label: isPregnancy ? 'Gestational hypertension range' : 'Stage 2 hypertension',
      color: healthTone.alert.badge,
      urgent: false,
    };
  }
  if (sys >= 130 || dia >= 80) {
    return {
      band: 'stage1',
      label: 'Stage 1 hypertension',
      color: healthTone.watch.badge,
      urgent: false,
    };
  }
  if (sys >= 120) {
    return {
      band: 'elevated',
      label: 'Elevated',
      color: healthTone.watch.badge,
      urgent: false,
    };
  }
  return {
    band: 'normal',
    label: 'Normal',
    color: healthTone.ok.badge,
    urgent: false,
  };
}

export default function BloodPressureTracker({ mode }: BloodPressureTrackerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<BpEntry[]>([]);
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [pulse, setPulse] = useState('');
  const [note, setNote] = useState('');

  const accountVersion = useAccountDataVersion([user ? STORAGE_KEY(user.id) : null]);
  useEffect(() => {
    if (!user) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(user.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setEntries(parsed.filter(e => e?.date && typeof e?.systolic === 'number' && typeof e?.diastolic === 'number'));
      }
    } catch { /* ignore */ }
  }, [user, accountVersion]);

  const persist = (next: BpEntry[]) => {
    if (!user) return;
    try { window.localStorage.setItem(STORAGE_KEY(user.id), JSON.stringify(next)); } catch { /* ignore */ }
    pushAccountData(user.id, STORAGE_KEY(user.id));
    setEntries(next);
  };

  const isPregnancy = mode === 'pregnancy';

  const latest = useMemo(() => {
    const sorted = [...entries].sort((a, b) =>
      `${b.date}T${b.time ?? '00:00'}`.localeCompare(`${a.date}T${a.time ?? '00:00'}`)
    );
    return sorted[0] ?? null;
  }, [entries]);

  const latestClass = latest ? classify(latest.systolic, latest.diastolic, isPregnancy) : null;

  // Recent average (last 7 days). Useful when an OB asks "what's
  // your baseline?" — a single reading is noisy, an average isn't.
  const sevenDayAvg = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const recent = entries.filter(e => parseISO(e.date).getTime() >= cutoff.getTime());
    if (recent.length === 0) return null;
    const s = recent.reduce((sum, e) => sum + e.systolic, 0) / recent.length;
    const d = recent.reduce((sum, e) => sum + e.diastolic, 0) / recent.length;
    return { sys: s, dia: d, count: recent.length };
  }, [entries]);

  const handleLog = () => {
    const s = parseInt(sys, 10);
    const d = parseInt(dia, 10);
    const p = pulse.trim() ? parseInt(pulse, 10) : null;
    if (!Number.isFinite(s) || s < 60 || s > 260) {
      toast({ variant: 'destructive', title: 'Systolic looks off', description: 'Enter a number between 60 and 260.' });
      return;
    }
    if (!Number.isFinite(d) || d < 30 || d > 180) {
      toast({ variant: 'destructive', title: 'Diastolic looks off', description: 'Enter a number between 30 and 180.' });
      return;
    }
    if (p !== null && (!Number.isFinite(p) || p < 30 || p > 220)) {
      toast({ variant: 'destructive', title: 'Pulse looks off', description: 'Leave blank or enter 30–220.' });
      return;
    }
    const now = new Date();
    const entry: BpEntry = {
      date: format(now, 'yyyy-MM-dd'),
      time: format(now, 'HH:mm'),
      systolic: s,
      diastolic: d,
      pulse: p,
      note: note.trim() || undefined,
    };
    const next = [entry, ...entries].slice(0, 60);
    persist(next);
    const c = classify(s, d, isPregnancy);
    if (c.urgent) {
      toast({
        variant: 'destructive',
        title: 'Severe range — call your doctor',
        description: isPregnancy
          ? `${s}/${d} mmHg is in the severe range. ACOG advises contacting your doctor or maternity unit now.`
          : `${s}/${d} mmHg is in the hypertensive-crisis range. Re-measure after 5 minutes of rest; if it stays this high, call your doctor now, or emergency services with chest pain, breathlessness or vision changes.`,
      });
    } else {
      toast({ title: 'Reading logged', description: `${s}/${d} mmHg — ${c.label}` });
    }
    setSys('');
    setDia('');
    setPulse('');
    setNote('');
  };

  const handleDelete = (idx: number) => {
    const sorted = [...entries].sort((a, b) =>
      `${b.date}T${b.time ?? '00:00'}`.localeCompare(`${a.date}T${a.time ?? '00:00'}`)
    );
    const target = sorted[idx];
    persist(entries.filter(e => e !== target));
  };

  if (!SHOWN_MODES.has(mode)) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Activity className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Blood pressure</p>
          <p className="text-[11px] text-muted-foreground">
            {isPregnancy
              ? 'Pre-eclampsia watch — log home readings between check-ups'
              : 'Cardiovascular monitoring trend'}
          </p>
        </div>
      </div>

      {/* Quick log */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="space-y-1">
          <Label className="text-[11px]">Systolic</Label>
          <Input aria-label="Systolic"
            type="number"
            inputMode="numeric"
            value={sys}
            onChange={(e) => setSys(e.target.value)}
            placeholder="120"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Diastolic</Label>
          <Input aria-label="Diastolic"
            type="number"
            inputMode="numeric"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            placeholder="80"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Pulse (opt.)</Label>
          <Input aria-label="Pulse (opt.)"
            type="number"
            inputMode="numeric"
            value={pulse}
            onChange={(e) => setPulse(e.target.value)}
            placeholder="72"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">&nbsp;</Label>
          <Button onClick={handleLog} disabled={!sys || !dia} className="w-full h-9">
            Log
          </Button>
        </div>
      </div>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (e.g. left arm, resting, after walk)"
        className="h-8 text-xs mb-3"
      />

      {/* Latest reading + classification */}
      {latest && latestClass && (
        <div className={`rounded-lg border p-3 mb-3 ${latestClass.color}`}>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="label-mono !text-current opacity-80">Latest reading</span>
            {latestClass.urgent && <AlertTriangle className="h-4 w-4" />}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[28px] leading-none tabular-nums font-medium">{latest.systolic}/{latest.diastolic}</span>
            <span className="text-[11px] opacity-80">mmHg</span>
            <span className="ml-auto text-[10px] font-medium">{latestClass.label}</span>
          </div>
          <p className="text-[10px] mt-1 opacity-75">
            {format(parseISO(latest.date), DATE_FMT)}{latest.time ? ` · ${latest.time}` : ''}
            {latest.pulse ? ` · pulse ${latest.pulse} bpm` : ''}
          </p>
        </div>
      )}

      {/* 7-day average */}
      {sevenDayAvg && (
        <p className="text-[11px] text-muted-foreground mb-3">
          7-day average: <span className="font-mono">{sevenDayAvg.sys.toFixed(0)}/{sevenDayAvg.dia.toFixed(0)}</span> mmHg
          {' '}({sevenDayAvg.count} reading{sevenDayAvg.count === 1 ? '' : 's'})
        </p>
      )}

      {/* Recent log */}
      {entries.length > 0 && (
        <details>
          <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
            Recent readings ({entries.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {[...entries]
              .sort((a, b) => `${b.date}T${b.time ?? '00:00'}`.localeCompare(`${a.date}T${a.time ?? '00:00'}`))
              .slice(0, 12)
              .map((e, i) => {
                const c = classify(e.systolic, e.diastolic, isPregnancy);
                return (
                  <li key={`${e.date}-${e.time}-${i}`} className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground w-24">
                      {format(parseISO(e.date), DAY_MONTH_FMT)}{e.time ? ` ${e.time}` : ''}
                    </span>
                    <span className="font-mono">{e.systolic}/{e.diastolic}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${c.color}`}>{c.band}</span>
                    {e.pulse && <span className="text-muted-foreground">·{e.pulse}bpm</span>}
                    <button
                      type="button"
                      onClick={() => handleDelete(i)}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      aria-label="Remove entry"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}
          </ul>
        </details>
      )}

      {entries.length > 0 && <EvidenceNote specs={[evidenceSpec('blood-pressure', mode)]} className="mt-1" />}

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        {isPregnancy
          ? <>Reference: ACOG 2020 hypertension in pregnancy guidance. Home readings supplement, don't replace, clinic measurements. Severe range (≥160/≥110): call your doctor or maternity unit straight away.</>
          : <>Reference: AHA/ACC 2025 blood pressure guideline (same categories as 2017). Blood pressure tends to rise after menopause; home readings supplement, don't replace, clinic measurements. ≥180/≥120 is a hypertensive crisis — call your doctor right away.</>}
      </p>
    </Card>
  );
}
