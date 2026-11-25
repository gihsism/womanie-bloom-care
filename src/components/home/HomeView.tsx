import { useCallback, useMemo, useState } from 'react';
import { ChevronRight, Plus, Square } from 'lucide-react';
import type { HeaderModel } from '@/lib/stageHeader';
import { STAGE_PAGE, type Target, type TodayItem } from '@/lib/todayItems';
import type { Tile } from '@/lib/quickLog/tiles';
import { badgeFor, loggedRows, type Badge, type QuickLogState } from '@/lib/quickLog/state';
import type { LogResult } from '@/hooks/useQuickLog';
import StageHeader from './StageHeader';
import TodayLog from './TodayLog';
import UndoBar, { type UndoMessage } from './UndoBar';
import ChoiceSheet from './ChoiceSheet';
import LogTodaySheet from './LogTodaySheet';
import { elapsed, useNow } from './TileGrid';

// Home in idea 4, round 6 ("much more straightforward"), as a pure view:
// everything comes in as props, so the page (PatientDashboard) and the dev
// preview render the same thing. Three things only:
//   1. the coloured stage header: ONE big fact and one sentence
//   2. ONE primary action at the bottom of the header — "Log today", which
//      opens the one-tap tiles in a sheet. Two exceptions, because they
//      ARE today's one thing: a running timer ("Left · 4:12 · Stop") and
//      an untaken daily pill ("Took my pill").
//   3. Today: at most three rows, the rest behind "Show all"
// Then ONE quiet row, "Trackers & guides", to the stage page
// (/dashboard/stage), where everything that used to be on Home lives.

export interface HomeViewProps {
  header: HeaderModel;
  tiles: Tile[];
  state: QuickLogState;
  items: TodayItem[];
  go: (t: Target) => void;
  log: (tile: Tile, choice?: { label: string; value: string }) => Promise<LogResult | null>;
  now?: Date;
}

/** Which one action Home shows: a running timer, today's pill, or "Log today". */
export function primaryFor(tiles: Tile[], badges: Record<string, Badge>): { kind: 'timer' | 'pill'; tile: Tile } | { kind: 'log' } {
  const running = tiles.find(t => t.action.kind === 'timer' && badges[t.id]?.runningSince != null);
  if (running) return { kind: 'timer', tile: running };
  const pill = tiles.find(t => t.id === 'pill');
  const pillLogged = badges.pill?.done || badges['pill-missed']?.done;
  if (pill && !pillLogged) return { kind: 'pill', tile: pill };
  return { kind: 'log' };
}

const TIMER_NAME: Record<string, string> = { feed_l: 'Left feed', feed_r: 'Right feed', baby_sleep: 'Sleep', contraction: 'Contraction' };
const timerName = (t: Tile) => (t.action.kind === 'timer' ? TIMER_NAME[t.action.timer] : null) ?? t.label;

const PRIMARY = 'w-full h-14 rounded-full bg-stage-accent text-stage-on text-[18px] font-extrabold inline-flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-ink focus-visible:ring-offset-2 focus-visible:ring-offset-stage-head disabled:opacity-70';
const SECONDARY = 'mt-2 w-full min-h-11 text-[16px] font-bold text-stage-ink/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-ink rounded-full';

export default function HomeView({ header, tiles, state, items, go, log, now }: HomeViewProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<UndoMessage | null>(null);
  const [choice, setChoice] = useState<Tile | null>(null);
  const [sheet, setSheet] = useState(false);
  const closeMsg = useCallback(() => setMsg(null), []);

  const badges = useMemo(() => Object.fromEntries(tiles.map(t => [t.id, badgeFor(t, state, now)])), [tiles, state, now]);
  const logged = useMemo(() => loggedRows(state, now), [state, now]);
  const primary = primaryFor(tiles, badges);
  const tick = useNow(primary.kind === 'timer');

  const run = async (tile: Tile, option?: { label: string; value: string }) => {
    setBusy(tile.id);
    try {
      const r = await log(tile, option);
      if (r) setMsg({ key: Date.now(), title: r.title, undo: r.undo });
    } catch {
      setMsg({ key: Date.now(), title: 'Could not save. Check your connection and try again.', undo: null });
    } finally {
      setBusy(null);
    }
  };

  const onTap = (tile: Tile) => {
    setSheet(false);
    if (tile.action.kind === 'open') return go(tile.action.target);
    if (tile.action.kind === 'choice') return setChoice(tile);
    void run(tile);
  };

  return (
    <>
      <StageHeader model={header}>
        {primary.kind === 'log' ? (
          <button type="button" className={PRIMARY} onClick={() => setSheet(true)} data-testid="home-primary">
            <Plus className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
            Log today
          </button>
        ) : (
          <>
            <button
              type="button"
              className={PRIMARY}
              disabled={busy === primary.tile.id}
              onClick={() => void run(primary.tile)}
              data-testid="home-primary"
            >
              {primary.kind === 'timer' ? (
                <>
                  <Square className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>{timerName(primary.tile)} · <span className="tabular-nums">{elapsed(badges[primary.tile.id].runningSince!, tick)}</span> · Stop</span>
                </>
              ) : 'Took my pill'}
            </button>
            <button type="button" className={SECONDARY} onClick={() => setSheet(true)}>Log something else</button>
          </>
        )}
      </StageHeader>
      <TodayLog items={items} logged={logged} go={go} />
      <button
        type="button"
        onClick={() => go(STAGE_PAGE)}
        className="mt-6 flex min-h-14 w-full items-center gap-3 rounded-[1.25rem] border border-line bg-card px-4 text-left text-[17px] font-semibold hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent"
      >
        <span className="flex-1">Trackers & guides</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <LogTodaySheet
        open={sheet}
        onClose={() => setSheet(false)}
        tiles={tiles}
        badges={badges}
        busyId={busy}
        onTap={onTap}
        onDetails={(t) => { setSheet(false); go(t.details); }}
        onMore={() => { setSheet(false); go('sheet:log'); }}
      />
      <ChoiceSheet tile={choice} onClose={() => setChoice(null)} onPick={(t, o) => { setChoice(null); void run(t, o); }} />
      <UndoBar msg={msg} onClose={closeMsg} />
    </>
  );
}
