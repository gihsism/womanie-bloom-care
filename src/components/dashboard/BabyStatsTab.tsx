import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLifeEvents } from '@/hooks/useLifeEvents';
import { Button } from '@/components/ui/button';
import { dailyRows, feedSummary, type DayRow } from '@/lib/babyStats';

// Feeding and nappy statistics for one baby (last 7 days).
// Colours: feeds = brand primary (single series, title names it);
// nappies wet = blue, dirty = amber - validated colour-blind safe in
// light and dark mode. Text stays in text colours, never series colours.
const WET = '#3b82f6';
const DIRTY = '#d97706';

const fmtMin = (m: number | null) => {
  if (m === null) return '—';
  const h = Math.floor(m / 60); const min = Math.round(m % 60);
  return h === 0 ? `${min}m` : min === 0 ? `${h}h` : `${h}h ${min}m`;
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

const axis = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };

function ChartTip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-sm">
      <div className="font-medium mb-0.5">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-1.5 text-foreground">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

export default function BabyStatsTab({ babyId, onGoTo }: { babyId: string; onGoTo?: (tab: string) => void }) {
  const feeds = useLifeEvents('feed', { babyId, limit: 500 });
  const nappies = useLifeEvents('nappy', { babyId, limit: 500 });
  const [showTable, setShowTable] = useState(false);
  const rows: DayRow[] = useMemo(() => dailyRows(feeds.events, nappies.events, new Date()), [feeds.events, nappies.events]);
  const s = useMemo(() => feedSummary(feeds.events, new Date()), [feeds.events]);

  if (!feeds.loaded || !nappies.loaded) return <p className="text-xs text-muted-foreground">Loading…</p>;
  const sideTotal = s.left + s.right;
  const hasFeeds = rows.some(r => r.feeds > 0);
  const hasNappies = rows.some(r => r.wet + r.dirty > 0);

  return (
    <div className="space-y-4">
      {(feeds.error || nappies.error) && <p className="text-xs text-destructive">{feeds.error || nappies.error}</p>}

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feeding · last 24 hours</h4>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Tile label="Feeds" value={String(s.feeds24h)} />
          <Tile label="Average gap" value={fmtMin(s.avgGapMin)} />
          <Tile label="Longest stretch" value={fmtMin(s.longestStretchMin)} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Tile label="Feeds a day" value={s.avgFeedsPerDay === null ? '—' : s.avgFeedsPerDay.toFixed(1)} hint="7-day average" />
          <Tile label="Left / right" value={sideTotal ? `${Math.round((s.left / sideTotal) * 100)}% / ${Math.round((s.right / sideTotal) * 100)}%` : '—'} hint="7 days" />
          <Tile label="Bottle" value={s.bottleMlWindow ? `${s.bottleMlWindow} ml` : '—'} hint="7 days" />
        </div>
      </section>

      <section className="space-y-1">
        <h4 className="text-sm font-semibold">Feeds per day</h4>
        {hasFeeds ? (
          <div className="h-40 text-primary" role="img" aria-label={`Feeds per day, last 7 days: ${rows.map(r => `${r.label} ${r.feeds}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Bar dataKey="feeds" name="Feeds" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
            <p>No feeds logged yet. Log feeds in the Feed tab and they’ll be counted here.</p>
            {onGoTo && <Button size="sm" variant="outline" onClick={() => onGoTo('feed')}>Log a feed</Button>}
          </div>
        )}
      </section>

      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Nappies per day</h4>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: WET }} />Wet</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: DIRTY }} />Dirty</span>
          </div>
        </div>
        {hasNappies ? (
          <div className="h-40" role="img" aria-label={`Nappies per day, last 7 days: ${rows.map(r => `${r.label} ${r.wet} wet ${r.dirty} dirty`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Bar dataKey="wet" name="Wet" stackId="n" fill={WET} stroke="hsl(var(--card))" strokeWidth={2} maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="dirty" name="Dirty" stackId="n" fill={DIRTY} stroke="hsl(var(--card))" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
            <p>No nappies logged yet. Tap Wet, Dirty or Both in the Nappy tab.</p>
            {onGoTo && <Button size="sm" variant="outline" onClick={() => onGoTo('nappy')}>Log a nappy</Button>}
          </div>
        )}
      </section>

      <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => setShowTable(v => !v)}>
        {showTable ? 'Hide table' : 'Show as table'}
      </button>
      {showTable && (
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground text-left">
            <th className="font-normal py-1">Day</th><th className="font-normal">Feeds</th><th className="font-normal">Breast</th><th className="font-normal">Bottle</th><th className="font-normal">Wet</th><th className="font-normal">Dirty</th>
          </tr></thead>
          <tbody>
            {[...rows].reverse().map(r => (
              <tr key={r.date} className="border-t">
                <td className="py-1">{r.label}</td><td>{r.feeds}</td><td>{r.breastMin ? fmtMin(r.breastMin) : '—'}</td>
                <td>{r.bottleMl ? `${r.bottleMl} ml` : '—'}</td><td>{r.wet}</td><td>{r.dirty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-muted-foreground">Every baby is different. If feeding or nappies worry you, talk to your midwife, health visitor or paediatrician.</p>
    </div>
  );
}
