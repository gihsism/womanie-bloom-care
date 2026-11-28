import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLifeEvents, type LifeEvent } from '@/hooks/useLifeEvents';
import { countToday, fmtAgo, lastFeed, nappiesToday } from '@/lib/bodyMap';
import { METHOD_LABEL, fmtClock, quickFeedEvent, quickFeedFrom, quickFeedLabel, readActiveTimer, feedDetail } from '@/lib/babyQuickFeed';
import { useUndoNotice } from './useUndoNotice';
import { LOADING, ValueOrLoading } from './LoadingValue';

// Home's baby card (after birth, once a baby is added), under the baby
// hero: last feed, feeds and nappies today, a running feed/sleep timer,
// the next vaccination and the latest weight with its WHO percentile.
// Every line opens the matching Baby tab; "Log feed" repeats her last feed
// in one tap (the Feed tab's quick log) with the same 8-second Undo.
// Neutral numbers only. The vaccination and weight lines need the BAG
// schedule and the WHO tables, which load on their own after the card.

interface FeedsHook {
  events: LifeEvent[];
  /** false until her feeds have loaded: lines show "…", not "None yet" / 0. */
  loaded?: boolean;
  add: (e: { occurred_at: string; ended_at?: string | null; data?: Record<string, unknown> }) => Promise<LifeEvent | null>;
  remove: (id: string) => Promise<boolean>;
}
type Extras = typeof import('@/lib/babyHomeExtras');
let extrasP: Promise<Extras> | null = null;
const loadExtras = () => (extrasP ??= import('@/lib/babyHomeExtras').catch((e) => { extrasP = null; throw e; }));

const TAB = (t: string) => `/dashboard/baby?tab=${t}`;

function Line({ to, label, value, testId }: { to: string; label: string; value: string; testId: string }) {
  return (
    <li>
      <Link to={to} data-testid={testId} className="flex items-center gap-3 py-2.5 text-[15px] hover:text-primary transition-colors">
        <span className="text-muted-foreground w-[6.5rem] flex-shrink-0">{label}</span>
        <span className="flex-1 min-w-0 break-words tabular-nums"><ValueOrLoading value={value} /></span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function BabyHomeCard({ babyId, birthDate, sex, feeds, nappies, nappiesLoaded = true }: {
  babyId: string;
  birthDate: string | null;
  sex: string | null;
  feeds: FeedsHook;
  nappies: LifeEvent[];
  nappiesLoaded?: boolean;
}) {
  const vaccines = useLifeEvents('baby_vaccine', { babyId, limit: 200 });
  const growth = useLifeEvents('baby_growth', { babyId, limit: 30 });
  const [extras, setExtras] = useState<Extras | null>(null);
  useEffect(() => {
    let live = true;
    loadExtras().then((m) => { if (live) setExtras(m); }).catch(() => { /* lines stay hidden */ });
    return () => { live = false; };
  }, []);

  // Running timer started on the Baby page (kept on the device): a live clock.
  const timer = readActiveTimer(babyId);
  const fast = timer !== null;
  // The interval only re-renders; times are read fresh each render (a feed
  // just logged must not look like the future against a stale clock).
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick(n => n + 1), fast ? 1000 : 30000);
    return () => window.clearInterval(t);
  }, [fast]);

  const [notice, show] = useUndoNotice();
  const [busy, setBusy] = useState(false);
  const quick = quickFeedFrom(feeds.events[0]);
  const logFeed = async () => {
    if (!quick || busy) return;
    setBusy(true);
    try {
      const saved = await feeds.add(quickFeedEvent(quick));
      if (saved) show(`${quickFeedLabel(quick)} logged ✓`, () => feeds.remove(saved.id));
    } finally { setBusy(false); }
  };

  const at = new Date();
  const feedsLoaded = feeds.loaded !== false;
  const lf = lastFeed(feeds.events, at);
  const ago = lf ? fmtAgo(lf.minutesAgo) : null;
  const feedsToday = countToday(feeds.events, at);
  const np = nappiesToday(nappies, at);
  const vax = extras && vaccines.loaded ? extras.nextVaccine(birthDate, vaccines.events, at) : null;
  const weight = extras && growth.loaded ? extras.latestWeight(birthDate, sex, growth.events, at) : null;

  return (
    <section className="mb-6 rounded-2xl border border-border px-4 pt-2 pb-4" aria-label="Baby today" data-testid="baby-home-card">
      {timer && (
        <Link to={TAB(timer.kind === 'feed' ? 'feed' : 'sleep')} data-testid="baby-home-timer"
          className="mt-2 flex items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-[15px]">
          <span className="flex-1 min-w-0 truncate">{timer.kind === 'feed' ? `Feeding now · ${METHOD_LABEL[timer.side]}` : 'Asleep'}</span>
          <span className="font-display text-xl tabular-nums" aria-live="off">{fmtClock(at.getTime() - timer.start)}</span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
      <ul className="divide-y divide-border">
        <Line to={TAB('feed')} testId="baby-home-last-feed" label="Last feed"
          value={lf && ago ? [`${ago.value}${ago.unit ? ` ${ago.unit}` : ''} ago`, feedDetail(lf.method, lf.ml, lf.durationMin)].filter(Boolean).join(' · ') : feedsLoaded ? 'None yet' : LOADING} />
        <Line to={TAB('feed')} testId="baby-home-feeds" label="Feeds today" value={feedsLoaded ? String(feedsToday) : LOADING} />
        <Line to={TAB('nappy')} testId="baby-home-nappies" label="Nappies today" value={nappiesLoaded ? `${np.wet} wet · ${np.dirty} dirty` : LOADING} />
        {vax && <Line to={TAB('vax')} testId="baby-home-vaccine" label="Next vaccine" value={`${vax.what} · ${vax.when}`} />}
        {weight && <Line to={TAB('growth')} testId="baby-home-weight" label="Weight"
          value={[weight.weight, weight.percentile, weight.on].filter(Boolean).join(' · ')} />}
      </ul>
      {quick && timer?.kind !== 'feed' && (
        <Button type="button" variant="outline" className="mt-2 w-full h-auto min-h-11 py-2 gap-2 whitespace-normal" disabled={busy}
          onClick={() => { void logFeed(); }} data-testid="home-feed-quick-log">
          <Repeat className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> Log feed: {quickFeedLabel(quick)}
        </Button>
      )}
      {notice && <div className="mt-2">{notice}</div>}
    </section>
  );
}
