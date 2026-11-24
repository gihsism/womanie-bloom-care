import { useEffect, useRef, useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';
import type { Tile } from '@/lib/quickLog/tiles';
import type { Badge } from '@/lib/quickLog/state';
import TileIcon from './TileIcon';

// Idea 4 one-tap tiles: 3 per row, big line icon in a white circle, one or
// two words. Tap = log now. Hold (or right-click; keyboard: the "…" that
// appears on focus) = details. A count badge sits top-right; a running timer turns the tile
// into the stage accent and shows the elapsed time.

const HOLD_MS = 500;

const elapsed = (since: number, now: number) => {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

interface TileButtonProps {
  tile: Tile;
  badge: Badge;
  busy: boolean;
  now: number;
  onTap: (t: Tile) => void;
  onDetails: (t: Tile) => void;
}

function TileButton({ tile, badge, busy, now, onTap, onDetails }: TileButtonProps) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const running = badge.runningSince != null;

  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clear, []);

  const label = running
    ? `${tile.label}, running ${elapsed(badge.runningSince!, now)}. Tap to stop`
    : `${tile.label}${badge.count ? `, ${badge.count} today` : badge.done ? ', logged today' : ''}`;

  return (
    <li className="relative">
      <button
        type="button"
        aria-label={label}
        aria-busy={busy || undefined}
        disabled={busy}
        onPointerDown={() => {
          held.current = false;
          clear();
          timer.current = window.setTimeout(() => { held.current = true; onDetails(tile); }, HOLD_MS);
        }}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => { e.preventDefault(); clear(); held.current = true; onDetails(tile); }}
        onClick={() => { if (held.current) { held.current = false; return; } onTap(tile); }}
        className={`w-full h-[112px] rounded-3xl flex flex-col items-center justify-center gap-2 px-1 text-center select-none [-webkit-touch-callout:none] transition-[transform,background-color] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent focus-visible:ring-offset-2 disabled:opacity-70 ${
          running ? 'bg-stage-accent text-stage-on' : 'bg-stage-tint text-foreground hover:brightness-[0.98]'
        }`}
      >
        <span className={`grid place-items-center h-[52px] w-[52px] rounded-full ${running ? 'bg-stage-on/15 text-stage-on' : 'bg-stage-chip text-stage-accent'}`}>
          <TileIcon name={tile.icon} className="h-[30px] w-[30px]" />
        </span>
        <span className="text-[16px] sm:text-[17px] font-bold leading-[1.1] line-clamp-2 break-words">
          {tile.label}
          {running && <span className="block mt-0.5 text-[15px] font-semibold tabular-nums">{elapsed(badge.runningSince!, now)}</span>}
        </span>
      </button>
      {badge.count && !running && (
        <span aria-hidden="true" className="pointer-events-none absolute top-2.5 right-3 min-w-[28px] h-7 px-2 rounded-full bg-stage-accent text-stage-on text-[15px] font-extrabold grid place-items-center tabular-nums">
          {badge.count}
        </span>
      )}
      {!badge.count && badge.done && !running && (
        <span aria-hidden="true" className="pointer-events-none absolute top-2.5 right-3 h-7 w-7 rounded-full bg-stage-accent text-stage-on grid place-items-center">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      )}
      <button
        type="button"
        aria-label={`${tile.label}: details`}
        onClick={() => onDetails(tile)}
        className={`sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-1 focus-visible:left-1 focus-visible:h-8 focus-visible:w-8 focus-visible:grid focus-visible:place-items-center focus-visible:rounded-full focus-visible:bg-stage-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent ${running ? 'text-stage-accent' : 'text-stage-ink'}`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export interface TileGridProps {
  tiles: Tile[];
  badges: Record<string, Badge>;
  busyId?: string | null;
  onTap: (t: Tile) => void;
  onDetails: (t: Tile) => void;
}

export default function TileGrid({ tiles, badges, busyId, onTap, onDetails }: TileGridProps) {
  const anyRunning = Object.values(badges).some(b => b.runningSince != null);
  const now = useNow(anyRunning);
  return (
    <section aria-label="Tap to log" className="mt-5">
      <ul className="grid grid-cols-3 gap-2.5">
        {tiles.map(t => (
          <TileButton key={t.id} tile={t} badge={badges[t.id] ?? {}} busy={busyId === t.id} now={now} onTap={onTap} onDetails={onDetails} />
        ))}
      </ul>
    </section>
  );
}
