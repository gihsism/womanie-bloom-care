import { useCallback, useEffect, useMemo, useState } from 'react';
import SubPageHeader from '@/components/SubPageHeader';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { ArrowRight, MessageCircle, Loader2 } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { format } from 'date-fns';
import { getFriendlyName } from '@/lib/medical-utils';

// Side-by-side comparison of two documents.
//
// Pairs every extracted lab value by canonical title (which the
// normalizer makes safe — see api/_lib/normalize-test-title.ts).
// Three row classes:
//
//   * BOTH    — value present in A and B; renders the delta and a
//               status-shift label.
//   * A_ONLY  — value present only in doc A.
//   * B_ONLY  — value present only in doc B.
//
// Sorted so what changed bubbles first: status flips (improved /
// worsened) → bigger absolute % deltas → A_ONLY → B_ONLY → unchanged.

interface Doc {
  id: string;
  file_name: string;
  ai_suggested_name: string | null;
  uploaded_at: string | null;
}

interface Item {
  id: string;
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  data_type: string | null;
  document_id: string | null;
  date_recorded: string | null;
}

const SEVERITY: Record<string, number> = {
  critical: 3, abnormal: 2, normal: 1, expected: 1, informational: 0,
};

type StatusShift = 'improved' | 'worsened' | 'same';

function classifyShift(prev: string | null, next: string | null): StatusShift {
  const p = SEVERITY[prev ?? ''] ?? 0;
  const n = SEVERITY[next ?? ''] ?? 0;
  if (n < p) return 'improved';
  if (n > p) return 'worsened';
  return 'same';
}

function parseValue(s: string | null): number | null {
  if (!s) return null;
  const m = String(s).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function fmtVal(item: Item | null): string {
  if (!item || item.value == null) return '—';
  return item.unit ? `${item.value} ${item.unit}` : String(item.value);
}

interface PairedRow {
  title: string;
  a: Item | null;
  b: Item | null;
  klass: 'both' | 'a_only' | 'b_only';
  shift: StatusShift;
  pctChange: number | null;
  rank: number;
}

const STATUS_TONE: Record<string, string> = {
  critical: 'text-red-700 dark:text-red-300',
  abnormal: 'text-amber-700 dark:text-amber-300',
  normal: 'text-green-700 dark:text-green-300',
  expected: 'text-green-700 dark:text-green-300',
};
const STATUS_BG: Record<string, string> = {
  critical: 'bg-red-50 dark:bg-red-900/15',
  abnormal: 'bg-amber-50 dark:bg-amber-900/15',
};

export default function CompareDocs() {
  usePageTitle('Compare documents');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const aId = searchParams.get('a');
  const bId = searchParams.get('b');

  const [docs, setDocs] = useState<Doc[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user || !aId || !bId) return;
    const [docsRes, itemsRes] = await Promise.all([
      db.from('health_documents')
        .select('id, file_name, ai_suggested_name, uploaded_at')
        .eq('user_id', user.id),
      db.from('medical_extracted_data')
        .select('id, title, value, unit, reference_range, status, data_type, document_id, date_recorded')
        .eq('user_id', user.id),
    ]);
    setDocs((docsRes.data ?? []) as Doc[]);
    setItems((itemsRes.data ?? []) as Item[]);
    setLoaded(true);
  }, [user, aId, bId]);

  useEffect(() => { load(); }, [load]);

  const docA = docs.find(d => d.id === aId) ?? null;
  const docB = docs.find(d => d.id === bId) ?? null;

  const pairs = useMemo<PairedRow[]>(() => {
    if (!aId || !bId) return [];
    const aItems = items.filter(i => i.document_id === aId && i.data_type === 'lab_result');
    const bItems = items.filter(i => i.document_id === bId && i.data_type === 'lab_result');
    const titles = new Set<string>([...aItems.map(i => i.title), ...bItems.map(i => i.title)]);
    const aByTitle = new Map(aItems.map(i => [i.title, i]));
    const bByTitle = new Map(bItems.map(i => [i.title, i]));

    const rows: PairedRow[] = [];
    for (const title of titles) {
      const a = aByTitle.get(title) ?? null;
      const b = bByTitle.get(title) ?? null;
      const klass: PairedRow['klass'] = a && b ? 'both' : a ? 'a_only' : 'b_only';
      const shift: StatusShift = a && b ? classifyShift(a.status, b.status) : 'same';
      let pctChange: number | null = null;
      if (a && b) {
        const av = parseValue(a.value);
        const bv = parseValue(b.value);
        if (av !== null && bv !== null && av !== 0) {
          pctChange = ((bv - av) / Math.abs(av)) * 100;
        }
      }
      // Lower rank = sort earlier.
      let rank = 5;
      if (shift === 'worsened') rank = 0;
      else if (shift === 'improved') rank = 1;
      else if (klass === 'b_only') rank = 2;
      else if (klass === 'a_only') rank = 3;
      else if (pctChange !== null && Math.abs(pctChange) >= 10) rank = 4;
      rows.push({ title, a, b, klass, shift, pctChange, rank });
    }
    rows.sort((p, q) => {
      if (p.rank !== q.rank) return p.rank - q.rank;
      const pAbs = p.pctChange !== null ? Math.abs(p.pctChange) : -1;
      const qAbs = q.pctChange !== null ? Math.abs(q.pctChange) : -1;
      if (pAbs !== qAbs) return qAbs - pAbs;
      return p.title.localeCompare(q.title);
    });
    return rows;
  }, [items, aId, bId]);

  if (!aId || !bId) {
    return (
      <div className="min-h-screen bg-background">
        <SubPageHeader title="Compare documents" backTo="/dashboard/medical-history" backLabel="Records" />
        <div className="px-4 py-10 max-w-md mx-auto text-center space-y-4">
          <p className="text-[16px] text-muted-foreground">In Records, open a document and tap “Compare to…” to pick a second one.</p>
          <button type="button" className="btn-stage w-full" onClick={() => navigate('/dashboard/medical-history')}>
            Go to Records
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!docA || !docB) {
    return (
      <div className="min-h-screen bg-background">
        <SubPageHeader title="Compare documents" backTo="/dashboard/medical-history" backLabel="Records" />
        <div className="px-4 py-10 max-w-md mx-auto text-center space-y-4">
          <p className="text-[16px] text-muted-foreground">One or both documents weren&apos;t found in your account.</p>
          <button type="button" className="btn-stage w-full" onClick={() => navigate('/dashboard/medical-history')}>
            Go to Records
          </button>
        </div>
      </div>
    );
  }

  const summary = pairs.reduce((acc, r) => {
    if (r.shift === 'improved') acc.improved++;
    else if (r.shift === 'worsened') acc.worsened++;
    if (r.klass === 'a_only') acc.aOnly++;
    else if (r.klass === 'b_only') acc.bOnly++;
    return acc;
  }, { improved: 0, worsened: 0, aOnly: 0, bOnly: 0 });

  const askAboutComparison = () => {
    const aLabel = docA.ai_suggested_name || docA.file_name;
    const bLabel = docB.ai_suggested_name || docB.file_name;
    const q = `Compare my "${aLabel}" results with my "${bLabel}" results. What's changed and what should I focus on?`;
    navigate(`/dashboard/ai-doctor?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <SubPageHeader title="Compare documents" backTo="/dashboard/medical-history" backLabel="Records" action={
          <button type="button" onClick={askAboutComparison} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-[15px] font-semibold text-stage-accent hover:bg-muted">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Ask AI
          </button>
        } />

      <div className="px-4 py-6 max-w-4xl mx-auto space-y-4">
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Document A</p>
              <p className="text-sm font-semibold truncate">{docA.ai_suggested_name || docA.file_name}</p>
              {docA.uploaded_at && (
                <p className="text-[11px] text-muted-foreground">{format(new Date(docA.uploaded_at), 'MMM d, yyyy')}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Document B</p>
              <p className="text-sm font-semibold truncate">{docB.ai_suggested_name || docB.file_name}</p>
              {docB.uploaded_at && (
                <p className="text-[11px] text-muted-foreground">{format(new Date(docB.uploaded_at), 'MMM d, yyyy')}</p>
              )}
            </div>
          </div>
          {(summary.improved + summary.worsened + summary.aOnly + summary.bOnly) > 0 && (
            <div className="mt-3 flex items-center gap-3 text-[11px] flex-wrap">
              {summary.worsened > 0 && (
                <span className="text-red-700 dark:text-red-300 font-medium">
                  {summary.worsened} worsened
                </span>
              )}
              {summary.improved > 0 && (
                <span className="text-green-700 dark:text-green-300 font-medium">
                  {summary.improved} improved
                </span>
              )}
              {summary.bOnly > 0 && (
                <span className="text-muted-foreground">
                  {summary.bOnly} new in B
                </span>
              )}
              {summary.aOnly > 0 && (
                <span className="text-muted-foreground">
                  {summary.aOnly} only in A
                </span>
              )}
            </div>
          )}
        </Card>

        {pairs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No lab results to compare in either document.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] text-[10px] font-bold text-muted-foreground uppercase tracking-wide bg-muted/50 px-4 py-2.5">
              <div>Test</div>
              <div>Document A</div>
              <div>Document B</div>
              <div className="text-right">Change</div>
            </div>
            <ul className="divide-y divide-border/40">
              {pairs.map(p => {
                const aTone = p.a?.status ? STATUS_TONE[p.a.status] ?? '' : '';
                const bTone = p.b?.status ? STATUS_TONE[p.b.status] ?? '' : '';
                const rowBg =
                  p.shift === 'worsened' ? STATUS_BG.abnormal :
                  p.shift === 'improved' ? 'bg-green-50/60 dark:bg-green-900/10' :
                  '';
                return (
                  <li
                    key={p.title}
                    className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 px-4 py-2.5 items-center ${rowBg}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{getFriendlyName(p.title)}</p>
                      {p.a?.reference_range && (
                        <p className="text-[10px] text-muted-foreground truncate">ref {p.a.reference_range}</p>
                      )}
                      {!p.a?.reference_range && p.b?.reference_range && (
                        <p className="text-[10px] text-muted-foreground truncate">ref {p.b.reference_range}</p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className={`text-sm font-mono ${aTone}`}>{fmtVal(p.a)}</span>
                      {p.a?.status && p.a.status !== 'normal' && p.a.status !== 'expected' && (
                        <span className="text-[10px] text-muted-foreground ml-1">({p.a.status})</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className={`text-sm font-mono ${bTone}`}>{fmtVal(p.b)}</span>
                      {p.b?.status && p.b.status !== 'normal' && p.b.status !== 'expected' && (
                        <span className="text-[10px] text-muted-foreground ml-1">({p.b.status})</span>
                      )}
                    </div>
                    <div className="text-right text-[11px] flex-shrink-0">
                      {p.klass === 'a_only' && (
                        <span className="text-muted-foreground">only in A</span>
                      )}
                      {p.klass === 'b_only' && (
                        <span className="text-muted-foreground">new in B</span>
                      )}
                      {p.klass === 'both' && p.shift === 'worsened' && (
                        <span className="text-red-700 dark:text-red-300 font-medium inline-flex items-center gap-0.5">
                          <ArrowRight className="h-3 w-3" /> worsened
                        </span>
                      )}
                      {p.klass === 'both' && p.shift === 'improved' && (
                        <span className="text-green-700 dark:text-green-300 font-medium inline-flex items-center gap-0.5">
                          <ArrowRight className="h-3 w-3" /> improved
                        </span>
                      )}
                      {p.klass === 'both' && p.shift === 'same' && p.pctChange !== null && Math.abs(p.pctChange) >= 2 && (
                        <span className="text-muted-foreground">
                          {p.pctChange > 0 ? '+' : ''}{Math.round(p.pctChange)}%
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
