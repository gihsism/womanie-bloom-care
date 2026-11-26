import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/db/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { onHealthDataChange } from "@/lib/data-events";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Calendar, ArrowLeft, Activity, AlertTriangle, CheckCircle2, FlaskConical, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { documentCategoryLabel } from "@/lib/documentCategory";
import UserMenu from "@/components/UserMenu";
import { format } from "date-fns";

interface DocumentSummary {
  id: string;
  file_name: string;
  ai_suggested_name: string | null;
  ai_suggested_category: string | null;
  ai_summary: string | null;
  uploaded_at: string;
  document_type: string;
}

interface ExtractedItem {
  status: string | null;
  data_type: string | null;
  raw_data: string | Record<string, unknown> | null;
}

// CSV cell encoding — wraps the value in quotes whenever it contains
// a comma, quote, newline, or leading whitespace, and doubles internal
// quotes. RFC 4180-shaped output that Excel and Sheets both accept.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]|^\s/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>): string {
  const header = columns.map(c => csvCell(c.label)).join(',');
  const body = rows.map(r => columns.map(c => csvCell(r[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export default function HealthStatistics() {
  const navigate = useNavigate();
  usePageTitle('Health Statistics');
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [extracted, setExtracted] = useState<ExtractedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth/login');
  }, [user, authLoading, navigate]);

  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    try {
      const [docsRes, extractedRes] = await Promise.all([
        db.from('health_documents')
          .select('id, file_name, ai_suggested_name, ai_suggested_category, ai_summary, uploaded_at, document_type')
          .eq('user_id', user.id)
          .order('uploaded_at', { ascending: false }),
        db.from('current_extracted_data')
          .select('status, data_type, raw_data')
          .eq('user_id', user.id),
      ]);
      if (docsRes.error) throw docsRes.error;
      setDocuments(docsRes.data || []);
      setExtracted((extractedRes.data ?? []) as ExtractedItem[]);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => onHealthDataChange(fetchDocuments), [fetchDocuments]);

  const stats = useMemo(() => {
    const analyzedDocs = documents.filter(d => d.ai_summary).length;
    const labResults = extracted.filter(e => e.data_type === 'lab_result').length;
    const critical = extracted.filter(e => e.status === 'critical').length;
    const abnormal = extracted.filter(e => e.status === 'abnormal').length;
    const normal = extracted.filter(e => e.status === 'normal' || e.status === 'expected').length;

    // Count by panel from the raw_data JSON column.
    const panels = new Map<string, number>();
    for (const item of extracted) {
      if (item.data_type !== 'lab_result') continue;
      let raw: Record<string, unknown> | null = null;
      if (typeof item.raw_data === 'string') {
        try { raw = JSON.parse(item.raw_data); } catch { /* ignore */ }
      } else if (item.raw_data && typeof item.raw_data === 'object') {
        raw = item.raw_data as Record<string, unknown>;
      }
      const panel = typeof raw?.panel === 'string' ? raw.panel : 'Other';
      panels.set(panel, (panels.get(panel) ?? 0) + 1);
    }
    const topPanels = [...panels.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return { analyzedDocs, labResults, critical, abnormal, normal, topPanels };
  }, [documents, extracted]);

  const downloadCsv = async () => {
    if (!user) return;
    setDownloadingCsv(true);
    try {
      const { data, error } = await db
        .from('current_extracted_data')
        .select('title, value, unit, reference_range, status, data_type, date_recorded, notes, document_id')
        .eq('user_id', user.id)
        .order('date_recorded', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const docName = new Map(documents.map(d => [d.id, d.ai_suggested_name || d.file_name]));
      const enriched = rows.map(r => ({
        ...r,
        document_name: docName.get(String(r.document_id ?? '')) ?? '',
      }));
      const csv = buildCsv(enriched, [
        { key: 'title', label: 'Test' },
        { key: 'value', label: 'Value' },
        { key: 'unit', label: 'Unit' },
        { key: 'reference_range', label: 'Reference range' },
        { key: 'status', label: 'Status' },
        { key: 'data_type', label: 'Type' },
        { key: 'date_recorded', label: 'Date recorded' },
        { key: 'document_name', label: 'Source document' },
        { key: 'notes', label: 'Notes' },
      ]);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `womanie-health-data-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'CSV downloaded', description: `${enriched.length} row${enriched.length === 1 ? '' : 's'} exported.` });
    } catch (e) {
      console.error('CSV download failed:', e);
      toast({ variant: 'destructive', title: 'Download failed', description: 'Please try again.' });
    } finally {
      setDownloadingCsv(false);
    }
  };

  // One header for the loading and loaded page (idea 4): back, a big
  // title, and the CSV download as a quiet icon button. It used to fit
  // title, button, wordmark and menu on one row, which cut the wordmark
  // off on phones.
  const header = (
    <header className="page-head sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 pt-3 pb-3">
        <div className="flex items-center justify-between min-h-11">
          <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-2 min-h-11 -ml-1 px-1 hover:text-stage-accent" aria-label="Back to Home">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[15px] font-medium">Home</span>
          </button>
          <div className="flex items-center gap-1">
            {!loading && stats.labResults > 0 && (
              <button
                type="button"
                onClick={downloadCsv}
                disabled={downloadingCsv}
                className="inline-flex items-center gap-1.5 min-h-11 rounded-full px-3 text-[14px] font-semibold text-stage-accent hover:bg-stage-tint disabled:opacity-50"
                title="Download all your extracted lab values as a CSV"
              >
                <Download className="h-4 w-4" />
                {downloadingCsv ? 'Preparing…' : 'CSV'}
              </button>
            )}
            <UserMenu />
          </div>
        </div>
        <h1 className="page-title mt-1">Health statistics</h1>
        <p className="page-sub mt-1">Your documents and results in numbers</p>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <main className="max-w-3xl mx-auto px-4 py-5 space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-[1.25rem]" />
          <Skeleton className="h-40 w-full rounded-[1.25rem]" />
          <Skeleton className="h-40 w-full rounded-[1.25rem]" />
        </main>
      </div>
    );
  }

  const statTiles = [
    { icon: FileText, label: 'Documents', value: stats.analyzedDocs, note: 'read', tone: 'text-stage-accent' },
    { icon: FlaskConical, label: 'Lab results', value: stats.labResults, note: 'values', tone: 'text-stage-accent' },
    { icon: CheckCircle2, label: 'In range', value: stats.normal, note: 'healthy', tone: 'text-stage-accent' },
    { icon: AlertTriangle, label: 'Flagged', value: stats.critical + stats.abnormal, note: stats.critical > 0 ? `${stats.critical} critical` : 'to review', tone: 'text-destructive' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {header}
      <main className="max-w-3xl mx-auto px-4 pt-5 pb-10">
        {documents.length === 0 ? (
          <div className="panel px-5 py-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto" aria-hidden="true" />
            <p className="mt-3 text-[17px] font-bold">No documents yet</p>
            <p className="mt-1 text-[15px] text-muted-foreground">Upload a lab report in Records and its numbers show up here.</p>
            <button type="button" className="btn-stage mt-6 px-8" onClick={() => navigate('/dashboard/medical-history')}>
              Go to Records
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {statTiles.map((t) => (
                <div key={t.label} className="panel px-4 py-3.5">
                  <dt className="flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground">
                    <t.icon className={`h-4 w-4 ${t.tone}`} aria-hidden="true" />
                    {t.label}
                  </dt>
                  <dd className="mt-1 text-[1.75rem] font-extrabold leading-none">{t.value}</dd>
                  <dd className="mt-1 text-[13px] text-muted-foreground">{t.note}</dd>
                </div>
              ))}
            </dl>

            {stats.topPanels.length > 0 && (
              <section>
                <h2 className="section-title mb-3 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-stage-accent" aria-hidden="true" />
                  By panel
                </h2>
                <div className="row-group">
                  {stats.topPanels.map(([panel, count]) => {
                    const slug = panel
                      .toLowerCase()
                      .replace(/&/g, 'and')
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-+|-+$/g, '');
                    return (
                      <button
                        key={panel}
                        type="button"
                        onClick={() => navigate(`/dashboard/panel/${slug}`)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent"
                      >
                        <span className="text-[15px] font-semibold shrink-0 w-32 truncate">{panel}</span>
                        <span className="flex-1 bg-muted rounded-full h-2 overflow-hidden" aria-hidden="true">
                          <span className="block bg-stage-accent h-2 rounded-full" style={{ width: `${(count / stats.labResults) * 100}%` }} />
                        </span>
                        <span className="text-[14px] text-muted-foreground shrink-0 w-6 text-right">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h2 className="section-title mb-3">Documents</h2>
              <div className="row-group">
                {documents.map((doc) => (
                  <article key={doc.id} className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span className="grid place-items-center h-11 w-11 shrink-0 rounded-full bg-stage-tint text-stage-accent" aria-hidden="true">
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[16px] font-bold leading-snug">{doc.ai_suggested_name || doc.file_name}</h3>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-muted-foreground">
                          {documentCategoryLabel(doc.ai_suggested_category || doc.document_type)}
                          <span aria-hidden="true">·</span>
                          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                          {format(new Date(doc.uploaded_at), 'd MMM yyyy')}
                        </p>
                        {doc.ai_summary && (
                          <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">{doc.ai_summary}</p>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
