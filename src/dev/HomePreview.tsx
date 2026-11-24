import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import HomeView from '@/components/home/HomeView';
import { cycleDial } from '@/lib/bodyMap';
import { applyStageTheme } from '@/lib/stageTheme';
import { headerFor, type HeaderFacts } from '@/lib/stageHeader';
import { stageLabel } from '@/lib/stageLabels';
import { moreFor, todayItems, type TodaySignals } from '@/lib/todayItems';
import { EMPTY_STATE, tapKey, type QuickLogState, type TodayEvent } from '@/lib/quickLog/state';
import { loggedWord, tilesFor, type Tile } from '@/lib/quickLog/tiles';
import { symptomEdit, moodEdit, hotFlushEdit, segmentEdit } from '@/lib/quickLog/daily';

// DEV ONLY (never in a production build: App.tsx registers the route under
// import.meta.env.DEV). Renders Home's idea-4 view for any stage with
// fixture data, so the design can be checked without logging in:
//   /dashboard/dev-home?stage=pregnancy
// Taps update the fixture in memory, Undo puts it back.

const STAGES: LifeStage[] = ['pre-menstrual', 'menstrual-cycle', 'contraception', 'conception', 'ivf', 'pregnancy', 'postpartum', 'menopause', 'post-menopause'];

const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const iso = (h: number, m: number) => at(h, m).toISOString();
const daysFrom = (n: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const nextWeekday = (wd: number, h: number, m: number) => { const d = at(h, m); d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7 || 7)); return d; };
const ev = (id: string, kind: TodayEvent['kind'], h: number, m: number, data: Record<string, unknown> = {}, endMin?: number): TodayEvent =>
  ({ id, kind, occurred_at: iso(h, m), ended_at: endMin != null ? new Date(at(h, m).getTime() + endMin * 60000).toISOString() : null, data });

interface Fixture { state: QuickLogState; facts: Omit<HeaderFacts, 'stageName'>; signals: TodaySignals; weeks?: number; meds?: { id: string; name: string; dose: string | null; times_per_day: number | null }[]; hasBaby?: boolean }

function fixture(mode: LifeStage): Fixture {
  const visit = nextWeekday(4, 10, 30);
  const base = { ...EMPTY_STATE, row: { symptoms: null, mood: null, notes: null } };
  switch (mode) {
    case 'pregnancy':
      return {
        weeks: 30,
        state: { ...base, row: { symptoms: ['Back pain'], mood: null, notes: null }, taps: { [tapKey.symptom('Back pain')]: iso(7, 30) },
          kickSession: { startedAt: at(9, 40).getTime(), taps: Array.from({ length: 12 }, (_, i) => at(9, 40 + i * 3).getTime()) } },
        facts: { dueDate: daysFrom(70), kicksToday: 12, nextVisit: visit }, signals: { nextVisit: visit },
      };
    case 'menstrual-cycle':
    case 'conception':
    case 'pre-menstrual': {
      const start = daysFrom(-17);
      return {
        state: { ...base, row: { symptoms: ['Headache'], mood: ['sad'], notes: null }, taps: { [tapKey.symptom('Headache')]: iso(8, 10), [tapKey.mood('sad')]: iso(7, 45) } },
        // Before a first period nothing is logged yet: no cycle, just the last symptom.
        facts: mode === 'pre-menstrual'
          ? { lastSymptom: { name: 'Headache', date: new Date() }, nextVisit: null }
          : { cycle: cycleDial(start, 28, new Date()), cycleStart: start, nextVisit: visit }, signals: {},
      };
    }
    case 'contraception':
      return {
        state: { ...base, row: { symptoms: null, mood: null, notes: 'Pill: on-time' }, taps: { [tapKey.segment('Pill')]: iso(8, 2) } },
        facts: { pill: { isPill: true, packDay: 12, streak: 11, takenToday: 'taken' }, nextVisit: null }, signals: {},
      };
    case 'ivf':
      return {
        meds: [{ id: 'm1', name: 'Gonal-f', dose: '150 IU', times_per_day: 1 }, { id: 'm2', name: 'Menopur', dose: '75 IU', times_per_day: 1 }, { id: 'm3', name: 'Cetrotide', dose: '0.25 mg', times_per_day: 1 }],
        state: { ...base, events: [ev('d1', 'med_dose', 7, 55, { medication_id: 'm1', name: 'Gonal-f' })] },
        facts: { ivf: { phase: 'Stimulation', next: 'Trigger Shot', day: 6 }, doses: { taken: 1, total: 3 }, nextVisit: at(23, 30) },
        signals: { appointmentToday: at(23, 30) },
      };
    case 'postpartum':
      return {
        hasBaby: true,
        state: { ...base, running: { feed_l: Date.now() - 7 * 60000 }, events: [
          ev('f1', 'feed', 6, 10, { method: 'breast_r' }, 14), ev('f2', 'feed', 8, 40, { method: 'bottle' }),
          ev('n1', 'nappy', 6, 30, { type: 'wet' }), ev('n2', 'nappy', 9, 5, { type: 'dirty' }), ev('n3', 'nappy', 9, 50, { type: 'wet' }),
          ev('s1', 'baby_sleep', 7, 0, {}, 95),
        ] },
        facts: { baby: { name: 'Mia', dayOfLife: 12, lastFeedMin: 7, feedsToday: 3, wet: 2, dirty: 1, sleepMin: 95 }, nextVisit: visit }, signals: {},
      };
    case 'menopause':
    case 'post-menopause':
      return {
        state: { ...base, row: { symptoms: ['Insomnia'], mood: null, notes: 'Hot flashes: 4' }, taps: { [tapKey.segment('Hot flashes')]: iso(10, 5), [tapKey.symptom('Insomnia')]: iso(6, 50) } },
        facts: { hotFlushesToday: 4, hotFlushes7: 23, monthsSincePeriod: mode === 'menopause' ? 8 : 30, nextVisit: visit }, signals: {},
      };
    default:
      return { state: base, facts: {}, signals: {} };
  }
}

export default function HomePreview() {
  const [params, setParams] = useSearchParams();
  const mode = (STAGES.includes(params.get('stage') as LifeStage) ? params.get('stage') : 'pregnancy') as LifeStage;
  const fx = useMemo(() => fixture(mode), [mode]);
  const [state, setState] = useState<QuickLogState>(fx.state);
  useEffect(() => { setState(fx.state); applyStageTheme(mode); }, [fx, mode]);

  const log = useCallback(async (tile: Tile, choice?: { label: string; value: string }) => {
    const before = state;
    const a = tile.action;
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const edit = a.kind === 'symptom' ? symptomEdit(a.value) : a.kind === 'mood' ? moodEdit(a.value) : a.kind === 'hotflush' ? hotFlushEdit
      : a.kind === 'flow' ? segmentEdit('Flow', a.value) : a.kind === 'pill' ? segmentEdit('Pill', a.value)
      : a.kind === 'choice' && choice ? segmentEdit(a.segment, choice.value) : null;
    if (edit) setState(s => ({ ...s, row: edit.apply(s.row) }));
    else if (a.kind === 'kick') setState(s => ({ ...s, kickSession: { startedAt: s.kickSession?.startedAt ?? now.getTime(), taps: [...(s.kickSession?.taps ?? []), now.getTime()] } }));
    else if (a.kind === 'nappy') setState(s => ({ ...s, events: [...s.events, ev(`x${Date.now()}`, 'nappy', now.getHours(), now.getMinutes(), { type: a.value })] }));
    else if (a.kind === 'timer') setState(s => ({ ...s, running: s.running[a.timer] ? { ...s.running, [a.timer]: undefined } : { ...s.running, [a.timer]: now.getTime() } }));
    return { title: `${loggedWord(tile, choice?.label)} logged · ${hhmm}`, undo: async () => setState(before) };
  }, [state]);

  const tiles = tilesFor(mode, { weeksPregnant: fx.weeks, meds: fx.meds, hasBaby: fx.hasBaby });
  return (
    <div data-stage={mode} className="min-h-screen bg-background">
      <div className="w-full max-w-2xl mx-auto px-4 pt-0 sm:pt-6 pb-8">
        <HomeView
          header={headerFor(mode, { ...fx.facts, stageName: stageLabel(mode) })}
          tiles={tiles}
          state={state}
          items={todayItems(mode, fx.signals)}
          stage={stageLabel(mode)}
          more={moreFor(mode, { weeksPregnant: fx.weeks })}
          go={(t) => { if (t.startsWith('?')) setParams(t.slice(1)); }}
          log={log}
        />
      </div>
    </div>
  );
}
