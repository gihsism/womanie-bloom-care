import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { hoursMin, weeklyLines, weeklySummary, type StatEvent } from '@/lib/babyStats';
import { footerLine, localDate, parseDay, daysBetween } from '@/lib/visitSummary';

// Baby: "Last 7 days" for the paediatrician visit. Feeds, nappies and
// sleep per day over the 7 complete days before today, with the daily
// averages on top. Neutral numbers only. Opened from the baby Stats tab;
// same print decisions as the visit summary (white page, black text,
// toolbar hidden on paper). Nothing leaves the device.

export interface BabySummaryData {
  name: string;
  birthDate: string | null;
  feeds: StatEvent[];
  nappies: StatEvent[];
  sleeps: StatEvent[];
}

const H2 = 'text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1';
const shortDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** "6 weeks old (born 12 October 2026)" - weeks up to 4 months, then months. */
export function babyAge(birthDate: string | null, now: Date): string | null {
  const born = parseDay(birthDate);
  if (!born) return null;
  const days = daysBetween(born, now);
  if (days < 0) return null;
  const age = days < 14 ? `${days} day${days === 1 ? '' : 's'} old`
    : days < 120 ? `${Math.floor(days / 7)} weeks old`
    : `${Math.floor(days / 30.4)} months old`;
  return `${age} (born ${localDate(born)})`;
}

export function BabySummarySheet({ data, now = new Date() }: { data: BabySummaryData; now?: Date }) {
  const s = weeklySummary(data.feeds, data.nappies, data.sleeps, now);
  const age = babyAge(data.birthDate, now);
  const anything = s.feedDays + s.nappyDays + s.sleepDays > 0;
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8 print:px-0 print:py-0" data-testid="baby-summary-sheet">
      <header className="mb-4 pb-3 border-b border-gray-300">
        <p className="text-xs uppercase tracking-wide text-gray-500">Baby · last 7 days</p>
        <h1 className="text-xl font-bold">{data.name}</h1>
        {age && <p className="text-sm">{age}</p>}
        <p className="text-xs text-gray-600">{localDate(s.from)} to {localDate(s.to)} · prepared {localDate(now)}</p>
      </header>

      <section className="mb-4 break-inside-avoid" data-section="averages">
        <h2 className={H2}>Daily averages</h2>
        <div className="text-sm space-y-0.5">
          {weeklyLines(s).map(l => <p key={l}>{l}</p>)}
        </div>
      </section>

      {anything && (
        <section className="mb-4 break-inside-avoid" data-section="days">
          <h2 className={H2}>Day by day</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300 text-xs text-gray-500">
                <th className="text-left py-1 font-medium">Day</th>
                <th className="text-right py-1 pl-2 font-medium">Feeds</th>
                <th className="text-right py-1 pl-2 font-medium">Wet</th>
                <th className="text-right py-1 pl-2 font-medium">Dirty</th>
                <th className="text-right py-1 pl-2 font-medium">Sleep</th>
              </tr>
            </thead>
            <tbody>
              {s.days.map(d => (
                <tr key={d.date} className="border-b border-gray-100">
                  <td className="py-1 pr-2 whitespace-nowrap">{shortDay(d.day)}</td>
                  <td className="py-1 pl-2 text-right tabular-nums">{d.feeds || '—'}{d.bottleMl ? <span className="block text-xs text-gray-600">{d.bottleMl} ml bottle</span> : null}</td>
                  <td className="py-1 pl-2 text-right tabular-nums">{d.wet + d.dirty ? d.wet : '—'}</td>
                  <td className="py-1 pl-2 text-right tabular-nums">{d.wet + d.dirty ? d.dirty : '—'}</td>
                  <td className="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{d.sleepMin ? hoursMin(d.sleepMin) : '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-medium">
                <td className="py-1 pr-2">Total</td>
                <td className="py-1 pl-2 text-right tabular-nums">{s.totals.feeds}</td>
                <td className="py-1 pl-2 text-right tabular-nums">{s.totals.wet}</td>
                <td className="py-1 pl-2 text-right tabular-nums">{s.totals.dirty}</td>
                <td className="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{hoursMin(s.totals.sleepMin)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-1">“—” = nothing of that kind logged that day. A nappy logged as both counts as wet and dirty. A sleep over midnight is split between the two days.</p>
        </section>
      )}

      <footer className="mt-6 pt-2 border-t border-gray-200 text-[10px] text-gray-500">{footerLine(now)}</footer>
    </article>
  );
}

export default function PrintBabySummary() {
  usePageTitle('Baby: last 7 days');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const babyParam = params.get('baby');
  const [data, setData] = useState<BabySummaryData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const babiesRes = await db.from('babies').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    const babies = (Array.isArray(babiesRes.data) ? babiesRes.data : []) as Array<{ id: string; name: string | null; birth_date: string | null }>;
    const baby = babies.find(b => String(b.id) === babyParam) ?? babies[0];
    if (babiesRes.error || !baby) { setFailed(true); return; }
    // 9 days back covers the 7 complete days and a sleep that started the evening before.
    const since = new Date(Date.now() - 9 * 86_400_000).toISOString();
    const events = (kind: string) => db.from('life_events').select('*')
      .eq('user_id', user.id).eq('kind', kind).eq('baby_id', baby.id)
      .gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(1000);
    const [f, n, s] = await Promise.all([events('feed'), events('nappy'), events('baby_sleep')]);
    if (f.error || n.error || s.error) { setFailed(true); return; }
    const rows = (r: { data: unknown }) => ((Array.isArray(r.data) ? r.data : []) as Array<Record<string, unknown>>).map(x => {
      let d = x.data as unknown;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
      return {
        occurred_at: new Date(String(x.occurred_at)).toISOString(),
        ended_at: x.ended_at ? new Date(String(x.ended_at)).toISOString() : null,
        data: (d ?? {}) as Record<string, unknown>,
      };
    });
    setData({ name: baby.name || 'Baby', birthDate: baby.birth_date ? String(baby.birth_date).slice(0, 10) : null, feeds: rows(f), nappies: rows(n), sleeps: rows(s) });
  }, [user, babyParam]);

  useEffect(() => { void load(); }, [load]);

  if (failed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white text-black px-4 text-center">
        <p className="text-sm">Could not load the baby log. Check your connection and try again.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Back</Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="border-b border-gray-200 print:hidden">
        <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <p className="text-sm font-medium">Last 7 days for the paediatrician</p>
            <p className="text-[11px] text-muted-foreground">Print or save as PDF.</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => window.print()} data-testid="baby-summary-print">
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>
      <BabySummarySheet data={data} />
    </div>
  );
}
