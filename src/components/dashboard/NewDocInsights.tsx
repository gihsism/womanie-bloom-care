import { useMemo, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, TrendingDown, TrendingUp, AlertCircle, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

// "What's changed since your last doc" banner.
//
// Renders at the top of MedicalHistory immediately after a new analysis
// lands. Compares the newest document's extracted_data against every
// prior document's extracted_data (keyed on standardized `title`) and
// surfaces three kinds of insight:
//
//   - `improved`  — a previously abnormal/critical value came back
//                   normal this time, or stepped down from critical
//                   to abnormal.
//   - `worsened`  — a previously normal value became abnormal/
//                   critical, or stepped up.
//   - `new`       — a test that has no history at all came back
//                   abnormal or critical (so it's worth calling out).
//
// Dismissible per-document via localStorage (keyed on user + doc id) so
// it doesn't keep nagging after Alena has seen it.

interface Doc {
  id: string;
  uploaded_at: string | null;
  ai_summary: string | null;
  ai_suggested_name: string | null;
  file_name: string;
}

interface Item {
  id: string;
  document_id: string | null;
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
  data_type: string;
  date_recorded: string | null;
}

interface Props {
  documents: Doc[];
  medicalData: Item[];
}

type Kind = 'improved' | 'worsened' | 'new';

interface Insight {
  kind: Kind;
  item: Item;
  prev?: Item;
}

const BAD = new Set(['abnormal', 'critical']);
const SEVERITY: Record<string, number> = {
  critical: 3,
  abnormal: 2,
  normal: 1,
  expected: 1,
  informational: 0,
};

function classifyShift(prev: Item | undefined, next: Item): Kind | null {
  if (!prev) {
    return BAD.has(next.status ?? '') ? 'new' : null;
  }
  const p = SEVERITY[prev.status ?? 'informational'] ?? 0;
  const n = SEVERITY[next.status ?? 'informational'] ?? 0;
  if (n < p && BAD.has(prev.status ?? '')) return 'improved';
  if (n > p && BAD.has(next.status ?? '')) return 'worsened';
  return null;
}

function fmtVal(i: Item): string {
  if (i.value == null) return '—';
  return i.unit ? `${i.value} ${i.unit}` : String(i.value);
}

export default function NewDocInsights({ documents, medicalData }: Props) {
  const { user } = useAuth();

  // The target doc is the most recent one that actually has an analysis
  // on it (ai_summary filled in). Docs that are still analyzing or
  // stalled aren't comparable yet.
  const latestDoc = useMemo(() => documents.find(d => d.ai_summary), [documents]);

  // Dismissal state. We key by user + doc id so another user on the
  // same device (or the same user after upload of a new doc) sees a
  // fresh banner. Read once on mount and re-check when the target
  // document changes.
  const dismissalKey = user && latestDoc ? `womanie_newdoc_dismissed_${user.id}_${latestDoc.id}` : null;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!dismissalKey) return;
    try {
      setDismissed(localStorage.getItem(dismissalKey) === '1');
    } catch {
      setDismissed(false);
    }
  }, [dismissalKey]);

  const insights = useMemo<Insight[]>(() => {
    if (!latestDoc) return [];
    const latestItems = medicalData.filter(m => m.document_id === latestDoc.id && m.data_type !== 'risk_screening');
    if (latestItems.length === 0) return [];
    const priorItems = medicalData.filter(m => m.document_id !== latestDoc.id && m.data_type !== 'risk_screening');
    const latestUploadedAt = latestDoc.uploaded_at ? Date.parse(latestDoc.uploaded_at) : 0;

    const out: Insight[] = [];
    for (const item of latestItems) {
      const priors = priorItems
        .filter(p => p.title === item.title && p.date_recorded)
        .filter(p => {
          const t = Date.parse(p.date_recorded as string);
          return Number.isFinite(t) && t <= latestUploadedAt;
        })
        .sort((a, b) =>
          Date.parse(b.date_recorded as string) - Date.parse(a.date_recorded as string)
        );
      const prev = priors[0];
      const kind = classifyShift(prev, item);
      if (kind) out.push({ kind, item, prev });
    }

    // Rank worsened first (most urgent to see), then new concerns, then
    // improvements. Within a kind, sort by severity of the current
    // status so critical bubbles up.
    const kindRank: Record<Kind, number> = { worsened: 0, new: 1, improved: 2 };
    out.sort((a, b) => {
      const k = kindRank[a.kind] - kindRank[b.kind];
      if (k !== 0) return k;
      return (SEVERITY[b.item.status ?? ''] ?? 0) - (SEVERITY[a.item.status ?? ''] ?? 0);
    });
    return out;
  }, [latestDoc, medicalData]);

  if (!latestDoc || dismissed || insights.length === 0) return null;

  const visible = insights.slice(0, 6);
  const hiddenCount = insights.length - visible.length;
  const worsenedCount = insights.filter(i => i.kind === 'worsened').length;
  const improvedCount = insights.filter(i => i.kind === 'improved').length;
  const newCount = insights.filter(i => i.kind === 'new').length;
  const summaryParts = [
    worsenedCount > 0 && `${worsenedCount} worsened`,
    newCount > 0 && `${newCount} new concern${newCount > 1 ? 's' : ''}`,
    improvedCount > 0 && `${improvedCount} improved`,
  ].filter(Boolean);

  const agoLabel = latestDoc.uploaded_at
    ? formatDistanceToNow(new Date(latestDoc.uploaded_at), { addSuffix: true })
    : '';

  const dismiss = () => {
    if (dismissalKey) {
      try { localStorage.setItem(dismissalKey, '1'); } catch { /* ignore */ }
    }
    setDismissed(true);
  };

  return (
    <Card className="p-4 border-l-4 border-l-primary">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-sm font-semibold">
                What's changed since your last test
              </p>
              <p className="text-[11px] text-muted-foreground">
                Based on your newest document
                {latestDoc.ai_suggested_name ? ` "${latestDoc.ai_suggested_name}"` : ''}
                {agoLabel ? ` · ${agoLabel}` : ''}
                {summaryParts.length > 0 ? ` · ${summaryParts.join(' · ')}` : ''}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-1" onClick={dismiss} aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ul className="space-y-1.5">
            {visible.map((ins, idx) => {
              const Icon =
                ins.kind === 'improved' ? TrendingDown :
                ins.kind === 'worsened' ? TrendingUp :
                AlertCircle;
              const tone =
                ins.kind === 'improved' ? 'text-green-700 dark:text-green-300' :
                ins.kind === 'worsened' ? 'text-red-700 dark:text-red-300' :
                'text-amber-700 dark:text-amber-300';
              return (
                <li key={idx} className="flex items-start gap-2 text-xs">
                  <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${tone}`} />
                  <span className="min-w-0">
                    <span className="font-medium">{ins.item.title}</span>
                    {' '}
                    {ins.kind === 'new' && (
                      <>
                        — new {ins.item.status} reading at <span className="font-medium">{fmtVal(ins.item)}</span>
                      </>
                    )}
                    {ins.kind === 'worsened' && ins.prev && (
                      <>
                        — was <span className="font-medium">{fmtVal(ins.prev)}</span> ({ins.prev.status}), now <span className="font-medium">{fmtVal(ins.item)}</span> ({ins.item.status})
                      </>
                    )}
                    {ins.kind === 'improved' && ins.prev && (
                      <>
                        — was <span className="font-medium">{fmtVal(ins.prev)}</span> ({ins.prev.status}), now <span className="font-medium">{fmtVal(ins.item)}</span>{ins.item.status ? ` (${ins.item.status})` : ''}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {hiddenCount > 0 && (
            <p className="text-[11px] text-muted-foreground mt-2">
              + {hiddenCount} more change{hiddenCount > 1 ? 's' : ''} in the full results below
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
