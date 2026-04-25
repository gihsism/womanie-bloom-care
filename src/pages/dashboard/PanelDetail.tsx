import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FlaskConical, Loader2, MessageCircle } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { format } from 'date-fns';
import { getFriendlyName } from '@/lib/medical-utils';
import ResultSparkline from '@/components/dashboard/ResultSparkline';
import UserMenu from '@/components/UserMenu';

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
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [docs, setDocs] = useState<DocLite[]>([]);
  const [loaded, setLoaded] = useState(false);

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
