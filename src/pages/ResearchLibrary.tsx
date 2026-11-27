import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { RESEARCH_DISCLAIMER } from '@/lib/research-sources';
import {
  EVIDENCE_LABEL,
  LIBRARY_STAGES,
  libraryStageFromMode,
  type LibraryItem,
  type LibraryResponse,
} from '@/lib/research-library';

// /library: browse the research library (clinical guidelines and
// systematic reviews from PubMed, summarised in plain English) by life
// stage and topic, with a search box. Defaults to the user's mode. State
// lives in the URL (?stage=&topic=&q=) so other screens can deep-link.

const PAGE = 20;

export default function ResearchLibrary() {
  usePageTitle('Research library');
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const stageParam = params.get('stage');
  const topic = params.get('topic') ?? '';
  const q = params.get('q') ?? '';

  const [userStage, setUserStage] = useState<string | null>(null);
  const [stageResolved, setStageResolved] = useState(Boolean(stageParam));
  const [query, setQuery] = useState(q);
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  // Default stage = the user's current mode (only when the URL has none).
  useEffect(() => {
    if (!stageParam && authLoading) return;
    if (stageParam || !user) {
      setStageResolved(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { db } = await import('@/integrations/db/client');
        const { data: profile } = await db.from('profiles').select('life_stage').eq('id', user.id).maybeSingle();
        if (!cancelled) setUserStage(libraryStageFromMode((profile as { life_stage?: string } | null)?.life_stage));
      } catch {
        /* fall back to all stages */
      } finally {
        if (!cancelled) setStageResolved(true);
      }
    })();
    return () => { cancelled = true; };
  }, [stageParam, user, authLoading]);

  const stage = stageParam ?? userStage ?? 'all';

  // Debounce the search box into the URL.
  useEffect(() => {
    if (query === q) return;
    const t = setTimeout(() => update({ q: query.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!stageResolved) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ stage });
    if (topic) qs.set('topic', topic);
    if (q) qs.set('q', q);
    fetch(`/api/research/library?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: LibraryResponse) => { if (!cancelled) { setData(d); setShown(PAGE); } })
      .catch(() => { if (!cancelled) setError('The library could not be loaded. Please try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [stage, topic, q, stageResolved]);

  function update(next: { stage?: string | null; topic?: string | null; q?: string | null }) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  }

  const topicLabel = useMemo(() => data?.topics.find((t) => t.id === topic)?.label, [data, topic]);
  const items = data?.items ?? [];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-3 py-2.5 flex items-center gap-2 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="label-mono !text-primary !text-[10px] leading-none">&#10022; What the research says</p>
            <h1 className="font-display text-[19px] font-medium leading-tight">Research library</h1>
          </div>
        </div>
      </header>

      <main className="px-4 pt-4 pb-10 max-w-3xl mx-auto">
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Clinical guidelines and research reviews about women&rsquo;s health, summarised in plain English.
        </p>
        <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{RESEARCH_DISCLAIMER}</p>

        {/* Search */}
        <label className="mt-4 flex items-center gap-2 h-11 px-4 rounded-full border border-input bg-card focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. coffee, iron, HRT"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
            aria-label="Search the research library"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        {/* Life stage */}
        <p className="label-mono mt-5 mb-2">Life stage</p>
        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LIBRARY_STAGES.map((s) => (
            <Chip
              key={s.id}
              active={stage === s.id}
              onClick={() => update({ stage: s.id, topic: null })}
              label={s.id === userStage ? `${s.label} · you` : s.label}
            />
          ))}
        </div>

        {/* Topics */}
        {data && data.topics.length > 0 && (
          <>
            <p className="label-mono mt-4 mb-2">Topic</p>
            <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip active={!topic} onClick={() => update({ topic: null })} label="All topics" />
              {data.topics.map((t) => (
                <Chip key={t.id} active={topic === t.id} onClick={() => update({ topic: t.id })} label={`${t.label} ${t.count}`} />
              ))}
            </div>
          </>
        )}

        {/* Results */}
        <div className="mt-5 flex items-baseline justify-between gap-3">
          <p className="text-[12.5px] text-muted-foreground min-w-0 truncate">
            {loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'summary' : 'summaries'}${topicLabel ? ` · ${topicLabel}` : ''}${q ? ` · “${q}”` : ''}`}
          </p>
          {data && <p className="label-mono !text-[10px] shrink-0">Updated {data.version}</p>}
        </div>

        {error && <p className="mt-6 text-sm text-destructive">{error}</p>}
        {loading && !data && (
          <div className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Nothing matched. Try a simpler word, another topic, or &ldquo;All&rdquo; life stages.
          </div>
        )}

        <ul className={`mt-3 space-y-3 ${loading && data ? 'opacity-60' : ''}`}>
          {items.slice(0, shown).map((it) => <ResearchCard key={it.id} item={it} />)}
        </ul>

        {items.length > shown && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" className="rounded-full h-10 px-6" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({items.length - shown})
            </Button>
          </div>
        )}

        <p className="mt-8 text-[11.5px] leading-relaxed text-muted-foreground text-center">
          Sources come from PubMed (US National Library of Medicine). Summaries are written from each paper&rsquo;s
          abstract. A few official Swiss sources (BAG, BLV, SGGG) are summarised by hand from the official page.{' '}
          {RESEARCH_DISCLAIMER}
        </p>
      </main>
    </div>
  );
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 h-8 px-3.5 rounded-full border text-[12.5px] whitespace-nowrap transition-colors ${
        active
          ? 'bg-primary border-primary text-primary-foreground'
          : 'bg-card border-border text-foreground hover:border-primary/60'
      }`}
    >
      {label}
    </button>
  );
}

function ResearchCard({ item }: { item: LibraryItem }) {
  const certainty = item.certainty && item.certainty !== 'not stated' ? `${item.certainty} certainty` : null;
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="label-mono !text-primary !text-[10px]">{EVIDENCE_LABEL[item.evidenceLevel]}</span>
        {item.landmark && <span className="label-mono !text-[10px]">· Landmark study</span>}
        <span className="label-mono !text-[10px]">· {item.year}</span>
        {certainty && <span className="label-mono !text-[10px]">· {certainty}</span>}
      </div>
      <h2 className="mt-1.5 font-display text-[16px] leading-snug font-[450] break-words">{item.title}</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground break-words">{item.source}</p>
      <p className="mt-2.5 text-[13.5px] leading-relaxed">{item.summary}</p>
      {item.keyPoints.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {item.keyPoints.map((k, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-snug text-foreground/90">
              <span className="mt-[7px] h-1 w-1 rounded-full bg-primary shrink-0" aria-hidden />
              <span className="min-w-0">{k}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-muted-foreground">Published {item.year}</span>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-primary/40 text-primary text-[12.5px] hover:bg-primary/5"
        >
          Read the source
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </li>
  );
}
