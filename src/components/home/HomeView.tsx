import { useCallback, useMemo, useState } from 'react';
import type { HeaderModel } from '@/lib/stageHeader';
import type { MoreRow, Target, TodayItem } from '@/lib/todayItems';
import type { Tile } from '@/lib/quickLog/tiles';
import { badgeFor, loggedRows, type QuickLogState } from '@/lib/quickLog/state';
import type { LogResult } from '@/hooks/useQuickLog';
import { MoreForStage } from '@/components/dashboard/HomeBlocks';
import StageHeader from './StageHeader';
import TileGrid from './TileGrid';
import TodayLog from './TodayLog';
import UndoBar, { type UndoMessage } from './UndoBar';
import ChoiceSheet from './ChoiceSheet';

// Home in idea 4, as a pure view: everything comes in as props, so the
// page (PatientDashboard) and the dev preview render the same thing.
//   1. coloured stage header   2. one-tap tiles (3 per row)
//   3. Today (needs-you rows + what was logged, with times)
//   4. More for <stage>

export interface HomeViewProps {
  header: HeaderModel;
  tiles: Tile[];
  state: QuickLogState;
  items: TodayItem[];
  stage: string;
  more: MoreRow[];
  go: (t: Target) => void;
  log: (tile: Tile, choice?: { label: string; value: string }) => Promise<LogResult | null>;
  now?: Date;
}

export default function HomeView({ header, tiles, state, items, stage, more, go, log, now }: HomeViewProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<UndoMessage | null>(null);
  const [choice, setChoice] = useState<Tile | null>(null);
  const closeMsg = useCallback(() => setMsg(null), []);

  const badges = useMemo(() => Object.fromEntries(tiles.map(t => [t.id, badgeFor(t, state, now)])), [tiles, state, now]);
  const logged = useMemo(() => loggedRows(state, now), [state, now]);

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
    if (tile.action.kind === 'open') return go(tile.action.target);
    if (tile.action.kind === 'choice') return setChoice(tile);
    void run(tile);
  };

  return (
    <>
      <StageHeader model={header} />
      <TileGrid tiles={tiles} badges={badges} busyId={busy} onTap={onTap} onDetails={(t) => go(t.details)} />
      <TodayLog items={items} logged={logged} go={go} />
      <div className="mt-6">
        <MoreForStage stage={stage} rows={more} go={go} />
      </div>
      <ChoiceSheet tile={choice} onClose={() => setChoice(null)} onPick={(t, o) => { setChoice(null); void run(t, o); }} />
      <UndoBar msg={msg} onClose={closeMsg} />
    </>
  );
}
