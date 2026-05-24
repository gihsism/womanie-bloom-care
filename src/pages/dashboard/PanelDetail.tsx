import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FlaskConical, Loader2, MessageCircle, Sparkles, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { format } from 'date-fns';
import { getFriendlyName } from '@/lib/medical-utils';
import ResultSparkline from '@/components/dashboard/ResultSparkline';
import UserMenu from '@/components/UserMenu';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import { hormoneKeyForTitle, assessAmh } from '@/lib/hormone-reference';

// Panel deep-dive — every reading in one panel (CBC, Thyroid Panel,
// Lipid Panel, …) across every document the user has uploaded,
// grouped by test title with a sparkline per test.
//
// Lifts the data straight off `current_extracted_data` and filters
// by raw_data.panel. Title + unit normalization (sessions 32+33)
// makes "Hemoglobin" rows from different docs collapse into one
// chart correctly.

interface ExtractedRow {
  id: string;
  document_id: string | null;
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  data_type: string | null;
  date_recorded: string | null;
  raw_data: Record<string, unknown> | string | null;
}

interface DocLite {
  id: string;
  ai_suggested_name: string | null;
  file_name: string;
}

const STATUS_TONE: Record<string, string> = {
  critical: 'text-red-700 dark:text-red-300',
  abnormal: 'text-amber-700 dark:text-amber-300',
  normal: 'text-green-700 dark:text-green-300',
  expected: 'text-green-700 dark:text-green-300',
};

function panelFromRow(row: ExtractedRow): string | null {
  const raw = row.raw_data;
  if (!raw) return null;
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return null; }
  } else if (typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }
  if (!parsed) return null;
  return typeof parsed.panel === 'string' ? parsed.panel : null;
}

function panelSlug(panel: string): string {
  return panel
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unsglug(slug: string): string {
  // Best-effort un-slug for the URL fallback. We always trust the
  // panels we find in the data over this regex; only used when the
  // user has zero rows in the requested panel and we still want to
  // show a sensible heading.
  return slug
    .split('-')
    .map(w => (w === 'and' ? '&' : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

interface TestSeries {
  title: string;
  unit: string | null;
  refRange: string | null;
  readings: ExtractedRow[];
  latest: ExtractedRow;
  flagged: number;
}

export default function PanelDetail() {
  usePageTitle('Panel detail');
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const healthContext = useUserHealthContext();
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [docs, setDocs] = useState<DocLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [aiSummary, setAiSummary] = useState<{ summary: string; cached: boolean; generatedAt: string | null } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [extractedRes, docsRes] = await Promise.all([
      db.from('current_extracted_data')
        .select('id, document_id, title, value, unit, reference_range, status, data_type, date_recorded, raw_data')
        .eq('user_id', user.id),
      db.from('health_documents')
        .select('id, ai_suggested_name, file_name')
        .eq('user_id', user.id),
    ]);
    setRows((extractedRes.data ?? []) as ExtractedRow[]);
    setDocs((docsRes.data ?? []) as DocLite[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const panelDisplayName = useMemo(() => {
    if (!slug) return '';
    // Find the canonical name from any matching row, otherwise un-slug.
    for (const r of rows) {
      const p = panelFromRow(r);
      if (p && panelSlug(p) === slug) return p;
    }
    return unsglug(slug);
  }, [rows, slug]);

  const series = useMemo<TestSeries[]>(() => {
    if (!slug) return [];
    const matching = rows.filter(r => {
      const p = panelFromRow(r);
      return p ? panelSlug(p) === slug : false;
    });
    const byTitle = new Map<string, ExtractedRow[]>();
    for (const r of matching) {
      const list = byTitle.get(r.title) ?? [];
      list.push(r);
      byTitle.set(r.title, list);
    }
    const out: TestSeries[] = [];
    for (const [title, list] of byTitle) {
      const sorted = [...list].sort((a, b) => {
        const ta = a.date_recorded ? Date.parse(a.date_recorded) : 0;
        const tb = b.date_recorded ? Date.parse(b.date_recorded) : 0;
        return tb - ta;
      });
      const latest = sorted[0];
      const flagged = sorted.filter(r => r.status === 'critical' || r.status === 'abnormal').length;
      out.push({
        title,
        unit: latest.unit,
        refRange: latest.reference_range,
        readings: sorted,
        latest,
        flagged,
      });
    }
    out.sort((a, b) => {
      // Most concerning latest status first.
      const aStatus = a.latest.status ?? '';
      const bStatus = b.latest.status ?? '';
      const sevRank: Record<string, number> = { critical: 0, abnormal: 1, normal: 2, expected: 2, informational: 3 };
      const sa = sevRank[aStatus] ?? 4;
      const sb = sevRank[bStatus] ?? 4;
      if (sa !== sb) return sa - sb;
      // Then more readings first (more meaningful trends).
      if (a.readings.length !== b.readings.length) return b.readings.length - a.readings.length;
      return a.title.localeCompare(b.title);
    });
    return out;
  }, [rows, slug]);

  const docName = useCallback((id: string | null): string => {
    if (!id) return '—';
    const d = docs.find(x => x.id === id);
    return d ? (d.ai_suggested_name || d.file_name) : '—';
  }, [docs]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalReadings = series.reduce((n, s) => n + s.readings.length, 0);
  const totalFlagged = series.reduce((n, s) => n + s.flagged, 0);

  const askAboutPanel = () => {
    const q = `Walk me through my ${panelDisplayName} results. What patterns do you see across my readings, and what should I focus on?`;
    navigate(`/dashboard/ai-doctor?q=${encodeURIComponent(q)}`);
  };

  const generateAiSummary = useCallback(async (force: boolean) => {
    if (!panelDisplayName) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const resp = await fetch('/api/summary/panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panel: panelDisplayName, force }),
      });
      const payload = await resp.json();
      if (!resp.ok) {
        throw new Error(payload?.error || `HTTP ${resp.status}`);
      }
      if (payload.summary) {
        setAiSummary({
          summary: payload.summary,
          cached: Boolean(payload.cached),
          generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : null,
        });
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setAiLoading(false);
    }
  }, [panelDisplayName]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3 max-w-4xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <h1 className="text-base font-bold truncate">{panelDisplayName}</h1>
          </div>
          {series.length > 0 && (
            <Button size="sm" variant="outline" onClick={askAboutPanel} className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Ask AI
            </Button>
          )}
          <UserMenu />
        </div>
      </div>

      <div className="px-4 py-6 max-w-4xl mx-auto space-y-4">
        {series.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No readings in this panel yet. Upload a document with results and Womanie will categorise them here.
          </Card>
        ) : (
          <>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">
                {series.length} {series.length === 1 ? 'test' : 'tests'} · {totalReadings} {totalReadings === 1 ? 'reading' : 'readings'}
                {totalFlagged > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 font-medium"> · {totalFlagged} flagged</span>
                )}
              </p>
            </Card>

            {/* AI panel narrative — three-section markdown read of
                this panel's history. Manual generate so we don't burn
                Anthropic on every panel page view; cached server-side
                in llm_cache so repeated clicks within the cache
                window come back instantly. */}
            <Card className="p-4 border-l-4 border-l-primary">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">AI panel insight</p>
                </div>
                {!aiSummary && !aiLoading && (
                  <Button size="sm" variant="outline" onClick={() => generateAiSummary(false)}>
                    Generate
                  </Button>
                )}
                {aiSummary && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1"
                    onClick={() => generateAiSummary(true)}
                    disabled={aiLoading}
                    aria-label="Regenerate AI insight"
                  >
                    <RefreshCw className={`h-3 w-3 ${aiLoading ? 'animate-spin' : ''}`} />
                    <span className="text-xs">Refresh</span>
                  </Button>
                )}
              </div>
              {aiLoading && !aiSummary && (
                <p className="text-xs text-muted-foreground">
                  Reading your {panelDisplayName} history…
                </p>
              )}
              {aiError && (
                <p className="text-xs text-destructive">
                  Could not generate summary: {aiError}
                </p>
              )}
              {!aiSummary && !aiLoading && !aiError && (
                <p className="text-xs text-muted-foreground">
                  Click <span className="font-medium">Generate</span> for a 3-section narrative across your {panelDisplayName} readings: what the panel is for, what your readings show (with trends), and what to bring to your next appointment.
                </p>
              )}
              {aiSummary && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{aiSummary.summary}</ReactMarkdown>
                </div>
              )}
            </Card>

            <div className="space-y-3">
              {series.map(s => {
                const sparklinePoints = s.readings
                  .filter(r => r.value && r.date_recorded)
                  .map(r => {
                    const m = String(r.value).match(/-?\d+(?:\.\d+)?/);
                    return {
                      value: m ? parseFloat(m[0]) : NaN,
                      date: r.date_recorded as string,
                      status: r.status ?? null,
                    };
                  })
                  .filter(p => Number.isFinite(p.value));
                const latestValue = s.latest.value
                  ? `${s.latest.value}${s.latest.unit ? ' ' + s.latest.unit : ''}`
                  : '—';
                const latestTone = STATUS_TONE[s.latest.status ?? ''] ?? '';

                // Personal range: with 3+ numeric readings, compute the
                // user's own min/median/max so they can tell whether a
                // technically-in-range value is unusual *for them*.
                let personalRange: { min: number; median: number; max: number } | null = null;
                if (sparklinePoints.length >= 3) {
                  const sortedVals = [...sparklinePoints].map(p => p.value).sort((a, b) => a - b);
                  const min = sortedVals[0];
                  const max = sortedVals[sortedVals.length - 1];
                  const median = sortedVals.length % 2 === 0
                    ? (sortedVals[sortedVals.length / 2 - 1] + sortedVals[sortedVals.length / 2]) / 2
                    : sortedVals[Math.floor(sortedVals.length / 2)];
                  personalRange = { min, median, max };
                }
                const fmt = (n: number): string => {
                  // Match the precision the latest reading uses so we
                  // don't print 12.300000000001.
                  const sample = String(s.latest.value ?? '');
                  const decimals = sample.includes('.') ? sample.split('.')[1].length : 0;
                  return n.toFixed(Math.min(decimals, 3));
                };
                return (
                  <Card key={s.title} className="p-4">
                    <div className="flex items-start gap-3 flex-wrap mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{getFriendlyName(s.title)}</p>
                        {s.refRange && (
                          <p className="text-[11px] text-muted-foreground">
                            healthy range {s.refRange}{s.unit ? ` ${s.unit}` : ''}
                          </p>
                        )}
                        {personalRange && (
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/80">your readings:</span>{' '}
                            {fmt(personalRange.min)}–{fmt(personalRange.max)}
                            {' '}<span className="text-muted-foreground">(median {fmt(personalRange.median)})</span>
                          </p>
                        )}
                        {/* Age-anchored expectation for hormones (AMH only
                            so far — FSH / estradiol etc. need cycle-phase
                            knowledge to be honest). Shown when we know
                            the user's age and the latest numeric value. */}
                        {(() => {
                          const key = hormoneKeyForTitle(s.title);
                          if (key !== 'amh' || !healthContext.age) return null;
                          const numericLatest = (() => {
                            const m = String(s.latest.value ?? '').match(/-?\d+(?:\.\d+)?/);
                            return m ? parseFloat(m[0]) : null;
                          })();
                          if (numericLatest === null) return null;
                          const a = assessAmh(numericLatest, healthContext.age);
                          if (!a) return null;
                          return (
                            <p className="text-[11px] text-muted-foreground">
                              <span className="font-medium text-foreground/80">for ages {a.ageBracket}:</span>{' '}
                              median {a.median} ng/mL (p5 {a.p5} – p95 {a.p95})
                            </p>
                          );
                        })()}
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-mono font-bold ${latestTone}`}>{latestValue}</p>
                        <p className="text-[11px] text-muted-foreground">latest</p>
                      </div>
                      {sparklinePoints.length >= 2 && (
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <ResultSparkline points={sparklinePoints} width={140} height={32} />
                          <span className="text-[10px] text-muted-foreground">
                            {sparklinePoints.length} readings
                          </span>
                        </div>
                      )}
                    </div>

                    <ul className="text-xs space-y-1 border-t border-border/40 pt-2">
                      {s.readings.slice(0, 6).map(r => {
                        const tone = STATUS_TONE[r.status ?? ''] ?? '';
                        const dateLabel = r.date_recorded
                          ? format(new Date(r.date_recorded), 'MMM d, yyyy')
                          : '—';
                        return (
                          <li key={r.id} className="flex items-baseline gap-2">
                            <span className="text-muted-foreground w-24 flex-shrink-0">{dateLabel}</span>
                            <span className={`font-mono ${tone}`}>
                              {r.value}{r.unit ? ` ${r.unit}` : ''}
                            </span>
                            {r.status && r.status !== 'normal' && r.status !== 'expected' && (
                              <span className="text-[10px] text-muted-foreground">({r.status})</span>
                            )}
                            {r.document_id && (
                              <Link
                                to={`/dashboard/medical-history?doc=${r.document_id}`}
                                className="ml-auto text-[11px] text-primary hover:underline truncate max-w-[180px]"
                              >
                                {docName(r.document_id)}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                      {s.readings.length > 6 && (
                        <li className="text-[10px] text-muted-foreground italic">
                          + {s.readings.length - 6} earlier reading{s.readings.length - 6 > 1 ? 's' : ''}
                        </li>
                      )}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
