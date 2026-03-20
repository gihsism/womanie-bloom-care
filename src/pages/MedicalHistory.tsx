import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DocumentUpload from '@/components/dashboard/DocumentUpload';
import {
  ArrowLeft,
  Home,
  FileText,
  Pill,
  Activity,
  FlaskConical,
  Syringe,
  AlertTriangle,
  Calendar,
  Stethoscope,
  Upload,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  BarChart3,
  Clock,
  Target,
  Minus,
  Info,
  Lightbulb,
  ArrowRight,
  Heart,
  ThumbsUp,
  Eye,
  HelpCircle,
} from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';
import {
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  ReferenceArea,
  PieChart as RechartsPie,
  Pie,
} from 'recharts';

interface MedicalDataItem {
  id: string;
  data_type: string;
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  date_recorded: string | null;
  notes: string | null;
  created_at: string;
  document_id: string | null;
  raw_data?: {
    priority?: string;
    panel?: string;
    is_repeat_test?: boolean;
    possible_conditions?: string[];
  } | null;
}

interface DocumentInfo {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  ai_suggested_name: string | null;
  ai_summary: string | null;
  ai_suggested_category: string | null;
  uploaded_at: string | null;
  document_type: string;
}

// Friendly labels for statuses — no jargon
const friendlyStatus: Record<string, { label: string; emoji: string; color: string; bgColor: string; description: string }> = {
  normal: { label: 'All good', emoji: '✅', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', description: 'This result is within the healthy range.' },
  expected: { label: 'Normal for you', emoji: '💙', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', description: 'This is outside the general range, but perfectly normal for your situation.' },
  abnormal: { label: 'Worth discussing', emoji: '⚠️', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', description: 'This result is outside the normal range. Talk to your doctor about it.' },
  critical: { label: 'Needs attention', emoji: '🔴', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', description: 'This needs urgent medical attention.' },
  informational: { label: 'For reference', emoji: 'ℹ️', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', description: 'Tracked for your records.' },
  active: { label: 'Current', emoji: '📌', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', description: '' },
  resolved: { label: 'Resolved', emoji: '✓', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', description: '' },
};

const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Friendly "what does this mean" for common test names
const friendlyTestNames: Record<string, string> = {
  'Hemoglobin': 'Hemoglobin — carries oxygen in your blood',
  'Ferritin': 'Ferritin — your iron stores',
  'TSH': 'TSH — thyroid function',
  'HCG': 'HCG — pregnancy hormone',
  'Vitamin D': 'Vitamin D — bone & immune health',
  'Iron': 'Iron — mineral for energy',
  'Glucose': 'Glucose — blood sugar',
  'Platelets': 'Platelets — blood clotting cells',
  'White Blood Cells': 'White Blood Cells — infection fighters',
  'Red Blood Cells': 'Red Blood Cells — oxygen carriers',
  'ALT': 'ALT — liver health marker',
  'AST': 'AST — liver health marker',
  'Estradiol': 'Estradiol — main estrogen hormone',
  'Progesterone': 'Progesterone — supports pregnancy',
  'FSH': 'FSH — reproductive hormone',
  'LH': 'LH — ovulation hormone',
  'Creatinine': 'Creatinine — kidney function',
};

function getFriendlyName(title: string): string {
  return friendlyTestNames[title] || title;
}

function getStatusInfo(status: string | null) {
  return friendlyStatus[status || ''] || friendlyStatus.informational;
}

// Render a value with a visual "gauge" showing where it falls in range
function ValueGauge({ value, unit, refRange, status }: { value: string | null; unit: string | null; refRange: string | null; status: string | null }) {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;

  const numVal = parseFloat(value);
  const hasNumeric = !isNaN(numVal);
  let percentage: number | null = null;

  if (hasNumeric && refRange) {
    const match = refRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
    if (match) {
      const low = parseFloat(match[1]);
      const high = parseFloat(match[2]);
      const range = high - low;
      if (range > 0) {
        // Show position: 0% = at low end, 100% = at high end
        percentage = Math.max(0, Math.min(100, ((numVal - low) / range) * 100));
      }
    }
  }

  const statusInfo = getStatusInfo(status);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className={`text-lg font-bold tabular-nums ${statusInfo.color}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {percentage !== null && (
        <div className="space-y-0.5">
          <div className="h-2 bg-muted rounded-full overflow-hidden relative">
            <div className="absolute inset-0 bg-green-200 dark:bg-green-900/40 rounded-full" />
            <div
              className={`absolute top-0 h-full w-1.5 rounded-full ${
                status === 'critical' ? 'bg-red-500' : status === 'abnormal' ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ left: `calc(${percentage}% - 3px)` }}
            />
          </div>
          <div className="flex justify-between">
            <span className="text-[9px] text-muted-foreground">Low</span>
            <span className="text-[9px] text-muted-foreground">High</span>
          </div>
        </div>
      )}
      {refRange && (
        <p className="text-[10px] text-muted-foreground">
          Healthy range: {refRange} {unit || ''}
        </p>
      )}
    </div>
  );
}

function renderEnhancedSummary(summary: string) {
  const sections = summary.split('\n\n');
  return (
    <div className="space-y-3">
      {sections.map((section, i) => {
        const trimmed = section.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('📋 Key Takeaways:')) {
          const items = trimmed.replace('📋 Key Takeaways:', '').trim().split('\n').filter(l => l.trim());
          return (
            <div key={i} className="bg-primary/5 rounded-xl p-4 border border-primary/10">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wide">What you should know</span>
              </div>
              <ul className="space-y-2">
                {items.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed flex items-start gap-2">
                    <span className="text-primary mt-0.5 flex-shrink-0">💡</span>
                    <span>{item.replace(/^[•\-]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        if (trimmed.startsWith('⚡ Action Items:')) {
          const items = trimmed.replace('⚡ Action Items:', '').trim().split('\n').filter(l => l.trim());
          return (
            <div key={i} className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-4 border border-amber-200 dark:border-amber-900/30">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">What to do next</span>
              </div>
              <ul className="space-y-2">
                {items.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5 flex-shrink-0">→</span>
                    <span>{item.replace(/^[•\-]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        return (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">{trimmed}</p>
        );
      })}
    </div>
  );
}

// A single result card — friendly, visual, no jargon
function ResultCard({ item }: { item: MedicalDataItem }) {
  const statusInfo = getStatusInfo(item.status);

  return (
    <div className={`rounded-xl p-4 border ${statusInfo.bgColor} transition-all`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-base">{statusInfo.emoji}</span>
            <span className="text-sm font-semibold">{getFriendlyName(item.title)}</span>
          </div>
          <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${statusInfo.color} border-current/20`}>
            {statusInfo.label}
          </Badge>
        </div>
        <div className="text-right flex-shrink-0">
          <ValueGauge value={item.value} unit={item.unit} refRange={item.reference_range} status={item.status} />
        </div>
      </div>
      {item.notes && (
        <div className="mt-3 bg-background/60 rounded-lg px-3 py-2.5 border border-border/30">
          <p className="text-sm leading-relaxed text-foreground/80">
            {item.notes}
          </p>
        </div>
      )}
      {/* Possible conditions — only for abnormal/critical */}
      {(item.status === 'abnormal' || item.status === 'critical') &&
        (item.raw_data as any)?.possible_conditions?.length > 0 && (
        <div className="mt-2.5 bg-background/80 rounded-lg px-3 py-2.5 border border-border/40">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <HelpCircle className="h-3 w-3" />
            What this could mean
          </p>
          <div className="flex flex-wrap gap-1.5">
            {((item.raw_data as any).possible_conditions as string[]).map((condition: string, idx: number) => (
              <span key={idx} className={`text-xs px-2.5 py-1 rounded-full border ${
                item.status === 'critical'
                  ? 'bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
              }`}>
                {condition}
              </span>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground mt-2 italic">
            ⚕️ These are possibilities, not diagnoses. Only your doctor can make a diagnosis.
          </p>
        </div>
      )}
      {item.date_recorded && (
        <p className="text-[10px] text-muted-foreground mt-2">
          📅 {format(new Date(item.date_recorded), 'MMMM d, yyyy')}
        </p>
      )}
    </div>
  );
}

export default function MedicalHistory() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [medicalData, setMedicalData] = useState<MedicalDataItem[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPanels, setExpandedPanels] = useState<Set<string>>(new Set());
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [medRes, docRes] = await Promise.all([
        supabase.from('medical_extracted_data').select('*').eq('user_id', user!.id).order('date_recorded', { ascending: false, nullsFirst: false }),
        supabase.from('health_documents').select('id, file_name, file_path, mime_type, ai_suggested_name, ai_summary, ai_suggested_category, uploaded_at, document_type').eq('user_id', user!.id).order('uploaded_at', { ascending: false }),
      ]);
      if (medRes.data) setMedicalData(medRes.data as MedicalDataItem[]);
      if (docRes.data) setDocuments(docRes.data);
    } catch (error) {
      console.error('Error fetching medical history:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePanel = (panel: string) => {
    setExpandedPanels(prev => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel);
      else next.add(panel);
      return next;
    });
  };

  const reanalyzeAll = async () => {
    if (!user || documents.length === 0) return;
    setReanalyzing(true);
    setReanalyzeProgress({ done: 0, total: documents.length });
    await supabase.from('medical_extracted_data').delete().eq('user_id', user.id);
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      try {
        await supabase.functions.invoke('analyze-document', {
          body: { documentId: doc.id, filePath: doc.file_path, fileName: doc.file_name, mimeType: doc.mime_type },
        });
      } catch (err) {
        console.error('Re-analysis failed for', doc.file_name, err);
      }
      setReanalyzeProgress({ done: i + 1, total: documents.length });
    }
    await fetchData();
    setReanalyzing(false);
  };

  const stats = useMemo(() => {
    const labResults = medicalData.filter(i => i.data_type === 'lab_result');
    const normalLabs = labResults.filter(i => i.status === 'normal' || i.status === 'expected').length;
    const abnormalLabs = labResults.filter(i => i.status === 'abnormal').length;
    const criticalLabs = labResults.filter(i => i.status === 'critical').length;
    const expectedLabs = labResults.filter(i => i.status === 'expected').length;

    const activeConditions = medicalData.filter(i => i.data_type === 'condition' && i.status === 'active');
    const activeMedications = medicalData.filter(i => i.data_type === 'medication' && i.status === 'active');

    // Group labs by panel
    const labsByPanel: Record<string, MedicalDataItem[]> = {};
    labResults.forEach(lab => {
      const rawData = lab.raw_data as any;
      const panel = rawData?.panel || 'Other Tests';
      if (!labsByPanel[panel]) labsByPanel[panel] = [];
      labsByPanel[panel].push(lab);
    });

    // Sort panels: panels with issues first
    const sortedPanels = Object.entries(labsByPanel).sort((a, b) => {
      const aHasIssue = a[1].some(l => l.status === 'critical' || l.status === 'abnormal');
      const bHasIssue = b[1].some(l => l.status === 'critical' || l.status === 'abnormal');
      if (aHasIssue && !bHasIssue) return -1;
      if (!aHasIssue && bHasIssue) return 1;
      return 0;
    });

    // Lab trends
    const labsWithValues = labResults
      .filter(l => l.value && !isNaN(parseFloat(l.value)) && l.date_recorded)
      .map(l => ({
        ...l,
        numVal: parseFloat(l.value!),
        rawData: l.raw_data as any,
      }));

    const labsByTitle: Record<string, typeof labsWithValues> = {};
    labsWithValues.forEach(l => {
      const key = l.title;
      if (!labsByTitle[key]) labsByTitle[key] = [];
      labsByTitle[key].push(l);
    });

    const labTrendData: Record<string, { data: { date: string; value: number; refLow: number | null; refHigh: number | null }[]; unit: string; latestStatus: string | null }> = {};
    Object.entries(labsByTitle).forEach(([title, labs]) => {
      const sorted = [...labs].sort((a, b) => new Date(a.date_recorded!).getTime() - new Date(b.date_recorded!).getTime());
      const parseRange = (r: string | null) => {
        if (!r) return { low: null, high: null };
        const m = r.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
        return m ? { low: parseFloat(m[1]), high: parseFloat(m[2]) } : { low: null, high: null };
      };
      labTrendData[title] = {
        data: sorted.map(l => {
          const { low, high } = parseRange(l.reference_range);
          return { date: format(new Date(l.date_recorded!), 'MMM d, yy'), value: l.numVal, refLow: low, refHigh: high };
        }),
        unit: sorted[0].unit || '',
        latestStatus: sorted[sorted.length - 1].status,
      };
    });

    const repeatedTests = Object.entries(labTrendData).filter(([, info]) => info.data.length >= 2);

    // Predictions
    const predictions: { title: string; trend: 'improving' | 'worsening' | 'stable'; detail: string }[] = [];
    repeatedTests.forEach(([title, info]) => {
      const vals = info.data.map(d => d.value);
      const first = vals[0];
      const last = vals[vals.length - 1];
      const refHigh = info.data[info.data.length - 1].refHigh;
      const refLow = info.data[info.data.length - 1].refLow;
      const changePct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;

      let trend: 'improving' | 'worsening' | 'stable' = 'stable';
      let detail = '';

      if (refHigh !== null && refLow !== null) {
        const isInRange = last >= refLow && last <= refHigh;
        const wasInRange = first >= refLow && first <= refHigh;
        if (!wasInRange && isInRange) { trend = 'improving'; detail = 'Back to a healthy range — great progress!'; }
        else if (wasInRange && !isInRange) { trend = 'worsening'; detail = 'Moved outside the healthy range — worth discussing with your doctor.'; }
        else if (Math.abs(changePct) <= 5) { detail = isInRange ? 'Staying steady in a healthy range.' : 'Still outside the healthy range, but stable.'; }
        else if (isInRange) { detail = `Changed ${Math.abs(changePct)}% but still healthy.`; }
        else {
          const movingToward = (last > refHigh && changePct < 0) || (last < refLow && changePct > 0);
          trend = movingToward ? 'improving' : 'worsening';
          detail = movingToward ? 'Moving toward the healthy range — heading in the right direction.' : 'Moving further from the healthy range — talk to your doctor.';
        }
      } else {
        detail = Math.abs(changePct) <= 5 ? 'Staying stable.' : `Changed ${Math.abs(changePct)}% across ${info.data.length} readings.`;
      }

      predictions.push({ title, trend, detail });
    });

    predictions.sort((a, b) => {
      const order = { worsening: 0, improving: 1, stable: 2 };
      return order[a.trend] - order[b.trend];
    });

    // Health score
    const overallHealthScore = labResults.length > 0 ? Math.round((normalLabs / labResults.length) * 100) : null;

    // Checkup timing
    const sortedDates = documents.filter(d => d.uploaded_at).map(d => new Date(d.uploaded_at!)).sort((a, b) => a.getTime() - b.getTime());
    let avgDaysBetweenDocs: number | null = null;
    let nextCheckupEstimate: Date | null = null;
    if (sortedDates.length >= 2) {
      const gaps = [];
      for (let i = 1; i < sortedDates.length; i++) gaps.push(differenceInDays(sortedDates[i], sortedDates[i - 1]));
      avgDaysBetweenDocs = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
      nextCheckupEstimate = addDays(sortedDates[sortedDates.length - 1], avgDaysBetweenDocs);
    }
    const daysSinceLastDoc = sortedDates.length > 0 ? differenceInDays(new Date(), sortedDates[sortedDates.length - 1]) : null;

    // Status pie
    const labStatusPie = [
      { name: 'All good', value: normalLabs - expectedLabs, color: '#22c55e' },
      { name: 'Normal for you', value: expectedLabs, color: '#3b82f6' },
      { name: 'Worth discussing', value: abnormalLabs, color: '#f59e0b' },
      { name: 'Needs attention', value: criticalLabs, color: '#ef4444' },
    ].filter(d => d.value > 0);

    return {
      labResults, normalLabs, abnormalLabs, criticalLabs, expectedLabs,
      activeConditions, activeMedications,
      labsByPanel: sortedPanels,
      labTrendData, repeatedTests, predictions,
      overallHealthScore, labStatusPie,
      avgDaysBetweenDocs, nextCheckupEstimate, daysSinceLastDoc,
    };
  }, [medicalData, documents]);

  const flaggedItems = useMemo(() =>
    [...medicalData]
      .filter(i => i.status === 'abnormal' || i.status === 'critical')
      .sort((a, b) => (priorityOrder[(a.raw_data as any)?.priority || 'low'] ?? 2) - (priorityOrder[(b.raw_data as any)?.priority || 'low'] ?? 2)),
    [medicalData]
  );

  const analyzedDocs = documents.filter(d => d.ai_summary);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasData = medicalData.length > 0;
  const hasDocuments = documents.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">My Health Records</h1>
            <p className="text-sm text-muted-foreground">Your results explained in plain language</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/welcome')}>
            <Home className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
        {hasDocuments && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={reanalyzeAll}
              disabled={reanalyzing}
              className="ml-auto"
            >
              {reanalyzing ? (
                <>Analyzing {reanalyzeProgress.done}/{reanalyzeProgress.total}…</>
              ) : (
                <>🔄 Re-analyze all documents</>
              )}
            </Button>
          </div>
        )}
        <DocumentUpload />

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full flex overflow-x-auto">
            <TabsTrigger value="overview" className="flex-1 text-xs sm:text-sm">Your Results</TabsTrigger>
            <TabsTrigger value="trends" className="flex-1 text-xs sm:text-sm">
              Changes
              {stats.repeatedTests.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">{stats.repeatedTests.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex-1 text-xs sm:text-sm">Documents</TabsTrigger>
          </TabsList>

          {/* ============ YOUR RESULTS TAB ============ */}
          <TabsContent value="overview" className="space-y-5 mt-4">
            {!hasDocuments ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-foreground text-center mb-2 font-semibold text-lg">Upload your first document</p>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Upload lab results, prescriptions, or medical reports. We'll analyze them and explain everything in plain language.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Quick Summary — friendly language */}
                {hasData && stats.labResults.length > 0 && (
                  <Card className="overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Heart className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h2 className="font-bold text-base">Your Health Snapshot</h2>
                          <p className="text-xs text-muted-foreground">Based on {stats.labResults.length} test results</p>
                        </div>
                      </div>

                      {/* Traffic light summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-200 dark:border-green-800">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-base">✅</span>
                            <span className="text-xs font-medium text-green-700 dark:text-green-400">All good</span>
                          </div>
                          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.normalLabs}</p>
                          <p className="text-[10px] text-green-600/70 dark:text-green-500/70">results look healthy</p>
                        </div>
                        {stats.expectedLabs > 0 && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-base">💙</span>
                              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Normal for you</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.expectedLabs}</p>
                            <p className="text-[10px] text-blue-600/70 dark:text-blue-500/70">expected for your stage</p>
                          </div>
                        )}
                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-base">⚠️</span>
                            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Worth discussing</span>
                          </div>
                          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.abnormalLabs}</p>
                          <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70">ask your doctor</p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-200 dark:border-red-800">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-base">🔴</span>
                            <span className="text-xs font-medium text-red-700 dark:text-red-400">Needs attention</span>
                          </div>
                          <p className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.criticalLabs}</p>
                          <p className="text-[10px] text-red-600/70 dark:text-red-500/70">talk to doctor soon</p>
                        </div>
                      </div>

                      {/* Health score bar */}
                      {stats.overallHealthScore !== null && (
                        <div className="mt-4 bg-muted/30 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Overall wellness score</span>
                            <span className={`text-sm font-bold ${
                              stats.overallHealthScore >= 80 ? 'text-green-600' : stats.overallHealthScore >= 50 ? 'text-amber-600' : 'text-red-600'
                            }`}>{stats.overallHealthScore}%</span>
                          </div>
                          <Progress value={stats.overallHealthScore} className="h-2.5" />
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            {stats.overallHealthScore >= 80 ? '🌟 Most of your results look great!' :
                             stats.overallHealthScore >= 50 ? '💬 Some results need a conversation with your doctor.' :
                             '⚕️ Several results need medical attention. Please consult your doctor.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* ⚠️ Things that need attention — front and center */}
                {flaggedItems.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-amber-600" />
                      Things to discuss with your doctor
                    </h3>
                    <div className="space-y-3">
                      {flaggedItems.map(item => (
                        <ResultCard key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Active conditions & medications — friendly */}
                {(stats.activeConditions.length > 0 || stats.activeMedications.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stats.activeConditions.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Stethoscope className="h-4 w-4 text-primary" />
                            <span className="text-sm font-bold">Current Conditions</span>
                          </div>
                          <div className="space-y-2">
                            {stats.activeConditions.map(item => (
                              <div key={item.id} className="bg-primary/5 rounded-xl px-3 py-2.5 border border-primary/10">
                                <span className="text-sm font-medium">📌 {item.title}</span>
                                {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {stats.activeMedications.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Pill className="h-4 w-4 text-primary" />
                            <span className="text-sm font-bold">Your Medications</span>
                          </div>
                          <div className="space-y-2">
                            {stats.activeMedications.map(item => (
                              <div key={item.id} className="bg-primary/5 rounded-xl px-3 py-2.5 border border-primary/10">
                                <span className="text-sm font-medium">💊 {item.title}</span>
                                {item.value && <span className="text-xs text-muted-foreground ml-2">{item.value}</span>}
                                {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* All results grouped by panel — collapsible, friendly */}
                {stats.labsByPanel.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-primary" />
                      All Your Test Results
                    </h3>
                    <div className="space-y-3">
                      {stats.labsByPanel.map(([panelName, labs]) => {
                        const hasIssues = labs.some(l => l.status === 'critical' || l.status === 'abnormal');
                        const allGood = labs.every(l => l.status === 'normal' || l.status === 'expected');
                        const isExpanded = expandedPanels.has(panelName);

                        return (
                          <Card key={panelName} className={`overflow-hidden ${hasIssues ? 'border-amber-200 dark:border-amber-900/30' : ''}`}>
                            <button
                              onClick={() => togglePanel(panelName)}
                              className="w-full p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors text-left"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-lg">
                                  {hasIssues ? '⚠️' : allGood ? '✅' : 'ℹ️'}
                                </span>
                                <div>
                                  <span className="text-sm font-semibold">{panelName}</span>
                                  <p className="text-[11px] text-muted-foreground">
                                    {labs.length} test{labs.length !== 1 ? 's' : ''} — {
                                      hasIssues
                                        ? `${labs.filter(l => l.status === 'abnormal' || l.status === 'critical').length} need${labs.filter(l => l.status === 'abnormal' || l.status === 'critical').length === 1 ? 's' : ''} review`
                                        : 'all look good'
                                    }
                                  </p>
                                </div>
                              </div>
                              <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                                {labs
                                  .sort((a, b) => {
                                    const aPri = (a.raw_data as any)?.priority || 'low';
                                    const bPri = (b.raw_data as any)?.priority || 'low';
                                    return (priorityOrder[aPri] ?? 2) - (priorityOrder[bPri] ?? 2);
                                  })
                                  .map(lab => (
                                    <ResultCard key={lab.id} item={lab} />
                                  ))
                                }
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI Summaries */}
                {analyzedDocs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      AI Summary of Your Documents
                    </h3>
                    <div className="space-y-3">
                      {analyzedDocs.map((doc) => (
                        <Card key={doc.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <FileText className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  <h4 className="text-sm font-semibold">{doc.ai_suggested_name || doc.file_name}</h4>
                                  {doc.uploaded_at && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                                    </span>
                                  )}
                                </div>
                                <div className="bg-muted/30 rounded-xl p-4 border border-border/30">
                                  {doc.ai_summary && renderEnhancedSummary(doc.ai_summary)}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ============ TRENDS / CHANGES TAB ============ */}
          <TabsContent value="trends" className="space-y-5 mt-4">
            {stats.repeatedTests.length === 0 && Object.keys(stats.labTrendData).length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <TrendingUp className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-foreground text-center mb-2 font-semibold text-lg">No changes to show yet</p>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    When you upload documents with the same tests taken at different times, we'll show you how your values are changing.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Predictions — friendly language */}
                {stats.predictions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      How your results are changing
                    </h3>
                    <div className="space-y-2">
                      {stats.predictions.map(p => (
                        <Card key={p.title} className={`overflow-hidden ${
                          p.trend === 'worsening' ? 'border-amber-200 dark:border-amber-900/30' :
                          p.trend === 'improving' ? 'border-green-200 dark:border-green-900/30' : ''
                        }`}>
                          <CardContent className="p-3.5 flex items-center gap-3">
                            <span className="text-xl">
                              {p.trend === 'improving' ? '📈' : p.trend === 'worsening' ? '📉' : '➡️'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{getFriendlyName(p.title)}</p>
                              <p className="text-xs text-muted-foreground">{p.detail}</p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${
                              p.trend === 'improving' ? 'text-green-600 border-green-300' :
                              p.trend === 'worsening' ? 'text-amber-600 border-amber-300' :
                              'text-muted-foreground'
                            }`}>
                              {p.trend === 'improving' ? 'Getting better' : p.trend === 'worsening' ? 'Getting worse' : 'Stable'}
                            </Badge>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline charts */}
                {stats.repeatedTests.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Your test history
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      See how each test value has changed over time. The green area shows the healthy range.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {stats.repeatedTests.map(([title, info]) => {
                        const hasRefRange = info.data.some(d => d.refLow !== null && d.refHigh !== null);
                        const refLow = info.data.find(d => d.refLow !== null)?.refLow ?? undefined;
                        const refHigh = info.data.find(d => d.refHigh !== null)?.refHigh ?? undefined;
                        const latestVal = info.data[info.data.length - 1].value;
                        const firstVal = info.data[0].value;
                        const changePct = firstVal > 0 ? Math.round(((latestVal - firstVal) / firstVal) * 100) : 0;
                        const statusInfo = getStatusInfo(info.latestStatus);

                        // Prediction
                        let predictedNext: number | null = null;
                        if (info.data.length >= 3) {
                          const vals = info.data.map(d => d.value);
                          const avgChange = (vals[vals.length - 1] - vals[0]) / (vals.length - 1);
                          predictedNext = Math.round((vals[vals.length - 1] + avgChange) * 100) / 100;
                        }

                        return (
                          <Card key={title}>
                            <CardHeader className="pb-1">
                              <CardTitle className="text-xs flex items-center justify-between">
                                <span className="truncate">{getFriendlyName(title)}</span>
                                <span className={`font-mono text-sm font-bold ${statusInfo.color}`}>
                                  {latestVal}{info.unit ? ` ${info.unit}` : ''}
                                </span>
                              </CardTitle>
                              <p className="text-[10px] text-muted-foreground">
                                {info.data.length} readings • {changePct > 0 ? '+' : ''}{changePct}% change
                              </p>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <ResponsiveContainer width="100%" height={140}>
                                <ComposedChart data={[
                                  ...info.data,
                                  ...(predictedNext !== null ? [{ date: 'Next?', value: predictedNext, refLow: refLow ?? null, refHigh: refHigh ?? null }] : [])
                                ]} margin={{ left: 0, right: 5, top: 5, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                                  <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                                  {hasRefRange && refLow !== undefined && refHigh !== undefined && (
                                    <ReferenceArea y1={refLow} y2={refHigh} fill="#22c55e" fillOpacity={0.08} label={{ value: "Healthy", position: "insideTopLeft", fontSize: 8, fill: "#22c55e" }} />
                                  )}
                                  <Tooltip
                                    content={({ active, payload }) => {
                                      if (!active || !payload?.length) return null;
                                      const d = payload[0].payload;
                                      const isPredicted = d.date === 'Next?';
                                      return (
                                        <div className="bg-background border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
                                          <p className={isPredicted ? 'text-primary font-medium' : ''}>
                                            {isPredicted ? '🔮 Predicted' : d.date}: <span className="font-bold">{d.value}{info.unit ? ` ${info.unit}` : ''}</span>
                                          </p>
                                          {d.refLow !== null && <p className="text-muted-foreground">Healthy range: {d.refLow}–{d.refHigh}</p>}
                                        </div>
                                      );
                                    }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    dot={(props: any) => {
                                      const { cx, cy, payload } = props;
                                      if (payload.date === 'Next?') {
                                        return <circle key="predicted" cx={cx} cy={cy} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 2" opacity={0.4} />;
                                      }
                                      return <circle key={payload.date} cx={cx} cy={cy} r={3} fill="hsl(var(--primary))" />;
                                    }}
                                  />
                                </ComposedChart>
                              </ResponsiveContainer>
                              {predictedNext !== null && (
                                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                  <span className="text-primary">🔮</span> We predict your next result could be around <span className="font-bold">{predictedNext}{info.unit ? ` ${info.unit}` : ''}</span>
                                  {hasRefRange && refLow !== undefined && refHigh !== undefined && (
                                    <span className={predictedNext >= refLow && predictedNext <= refHigh ? 'text-green-600' : 'text-amber-600'}>
                                      ({predictedNext >= refLow && predictedNext <= refHigh ? 'in the healthy range' : 'outside healthy range'})
                                    </span>
                                  )}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Single readings */}
                {Object.entries(stats.labTrendData).filter(([, info]) => info.data.length === 1).length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-1">Single Readings</h3>
                    <p className="text-xs text-muted-foreground mb-3">These tests only have one reading so far. Upload more documents to see trends.</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(stats.labTrendData)
                        .filter(([, info]) => info.data.length === 1)
                        .map(([title, info]) => {
                          const d = info.data[0];
                          const statusInfo = getStatusInfo(info.latestStatus);
                          return (
                            <Card key={title} className="p-3">
                              <p className="text-xs font-medium truncate">{getFriendlyName(title)}</p>
                              <p className={`text-lg font-mono font-bold ${statusInfo.color}`}>{d.value}{info.unit ? ` ${info.unit}` : ''}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-xs">{statusInfo.emoji}</span>
                                <span className={`text-[10px] ${statusInfo.color}`}>{statusInfo.label}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1">{d.date}</p>
                            </Card>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Checkup timing */}
                {documents.length >= 2 && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="text-sm font-bold">Your Checkup Pattern</span>
                      </div>
                      <div className="space-y-2">
                        {stats.avgDaysBetweenDocs !== null && (
                          <p className="text-sm text-muted-foreground">
                            📊 You typically get checked every <span className="font-semibold text-foreground">{stats.avgDaysBetweenDocs} days</span>
                          </p>
                        )}
                        {stats.daysSinceLastDoc !== null && (
                          <p className="text-sm text-muted-foreground">
                            📅 Your last document was <span className="font-semibold text-foreground">{stats.daysSinceLastDoc} days ago</span>
                          </p>
                        )}
                        {stats.nextCheckupEstimate && (
                          <p className="text-sm">
                            {differenceInDays(stats.nextCheckupEstimate, new Date()) > 0
                              ? <>🗓️ Your next checkup might be around <span className="font-semibold text-primary">{format(stats.nextCheckupEstimate, 'MMMM d, yyyy')}</span></>
                              : <>⏰ You might be <span className="font-semibold text-amber-600">{Math.abs(differenceInDays(stats.nextCheckupEstimate, new Date()))} days overdue</span> for a checkup</>
                            }
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ============ DOCUMENTS TAB ============ */}
          <TabsContent value="documents" className="space-y-4 mt-4">
            {documents.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-foreground font-semibold text-lg">No documents yet</p>
                  <p className="text-sm text-muted-foreground text-center">Upload your first health document above.</p>
                </CardContent>
              </Card>
            ) : (
              documents.map((doc) => (
                <Card key={doc.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm">{doc.ai_suggested_name || doc.file_name}</h4>
                          {doc.uploaded_at && (
                            <span className="text-xs text-muted-foreground">{format(new Date(doc.uploaded_at), 'MMMM d, yyyy')}</span>
                          )}
                        </div>
                        {doc.ai_summary && (
                          <div className="bg-muted/30 rounded-xl p-4 mt-3 border border-border/30">
                            {renderEnhancedSummary(doc.ai_summary)}
                          </div>
                        )}
                        {medicalData.filter(m => m.document_id === doc.id).length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">What we found</p>
                            {medicalData.filter(m => m.document_id === doc.id)
                              .sort((a, b) => (priorityOrder[(a.raw_data as any)?.priority || 'low'] ?? 2) - (priorityOrder[(b.raw_data as any)?.priority || 'low'] ?? 2))
                              .map(item => {
                                const si = getStatusInfo(item.status);
                                return (
                                  <div key={item.id} className="flex items-center gap-2 text-xs py-0.5">
                                    <span>{si.emoji}</span>
                                    <span className="font-medium">{item.title}</span>
                                    {item.value && <span className="text-muted-foreground font-mono">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>}
                                    <span className={`text-[10px] ${si.color}`}>{si.label}</span>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
