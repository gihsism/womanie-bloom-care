import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/db/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { onHealthDataChange } from "@/lib/data-events";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Calendar, ArrowLeft, Activity, AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function HealthStatistics() {
  const navigate = useNavigate();
  usePageTitle('Health Statistics');
  const { user, loading: authLoading } = useAuth();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [extracted, setExtracted] = useState<ExtractedItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => onHealthDataChange(fetchDocuments), [fetchDocuments]);

  const getCategoryColor = (category: string | null) => {
    const colors: Record<string, string> = {
      lab_results: 'bg-primary/10 text-primary',
      imaging: 'bg-secondary/10 text-secondary',
      prescription: 'bg-accent/10 text-accent',
      consultation_notes: 'bg-muted',
      vaccination_record: 'bg-primary/20 text-primary',
      other: 'bg-muted'
    };
    return colors[category || 'other'] || 'bg-muted';
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold mb-1">Health Statistics</h1>
            <p className="text-muted-foreground">AI-analyzed summaries of your health documents</p>
          </div>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-1">Health Statistics</h1>
          <p className="text-muted-foreground">AI-analyzed summaries of your health documents</p>
        </div>
        <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
          Womanie
        </a>
        <UserMenu />
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center mb-4">
              No documents uploaded yet. Upload health documents to see AI-generated summaries here.
            </p>
            <Button variant="outline" onClick={() => navigate('/dashboard/medical-history')}>
              Go to Medical Records
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Documents</p>
              </div>
              <p className="text-2xl font-bold">{stats.analyzedDocs}</p>
              <p className="text-[11px] text-muted-foreground">analyzed</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Lab results</p>
              </div>
              <p className="text-2xl font-bold">{stats.labResults}</p>
              <p className="text-[11px] text-muted-foreground">tracked values</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <p className="text-xs text-muted-foreground">Healthy</p>
              </div>
              <p className="text-2xl font-bold">{stats.normal}</p>
              <p className="text-[11px] text-muted-foreground">in range</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className={`h-4 w-4 ${stats.critical > 0 ? 'text-destructive' : 'text-amber-600'}`} />
                <p className="text-xs text-muted-foreground">Flagged</p>
              </div>
              <p className="text-2xl font-bold">{stats.critical + stats.abnormal}</p>
              <p className="text-[11px] text-muted-foreground">
                {stats.critical > 0 ? `${stats.critical} critical` : 'needs review'}
              </p>
            </Card>
          </div>

          {/* Breakdown by panel */}
          {stats.topPanels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  By panel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.topPanels.map(([panel, count]) => (
                    <div key={panel} className="flex items-center gap-3">
                      <span className="text-sm flex-shrink-0 w-40 truncate">{panel}</span>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${(count / stats.labResults) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Document list */}
          <div className="grid gap-4">
          {documents.map((doc) => (
            <Card key={doc.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-xl mb-2">
                      {doc.ai_suggested_name || doc.file_name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={getCategoryColor(doc.ai_suggested_category)}>
                        {doc.ai_suggested_category || doc.document_type}
                      </Badge>
                      <span className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                      </span>
                    </CardDescription>
                  </div>
                  <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                </div>
              </CardHeader>
              {doc.ai_summary && (
                <CardContent>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-semibold mb-2 text-sm">AI Summary</h4>
                    <p className="text-sm leading-relaxed">{doc.ai_summary}</p>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
        </div>
      )}
    </div>
  );
}
