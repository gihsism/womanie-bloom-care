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
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
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
  ReferenceLine,
  LineChart,
  Line,
  Area,
  AreaChart,
  Legend,
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
}

interface DocumentInfo {
  id: string;
  file_name: string;
  ai_suggested_name: string | null;
  ai_summary: string | null;
  ai_suggested_category: string | null;
  uploaded_at: string | null;
  document_type: string;
}

const typeConfig: Record<string, { icon: typeof Activity; label: string; color: string; bgColor: string }> = {
  condition: { icon: Stethoscope, label: 'Conditions', color: 'text-destructive', bgColor: 'bg-destructive/10' },
  medication: { icon: Pill, label: 'Medications', color: 'text-primary', bgColor: 'bg-primary/10' },
  lab_result: { icon: FlaskConical, label: 'Lab Results', color: 'text-secondary', bgColor: 'bg-secondary/10' },
  cycle_info: { icon: Calendar, label: 'Cycle Info', color: 'text-accent', bgColor: 'bg-accent/10' },
  allergy: { icon: AlertTriangle, label: 'Allergies', color: 'text-destructive', bgColor: 'bg-destructive/10' },
  procedure: { icon: Activity, label: 'Procedures', color: 'text-primary', bgColor: 'bg-primary/10' },
  vaccination: { icon: Syringe, label: 'Vaccinations', color: 'text-secondary', bgColor: 'bg-secondary/10' },
};

const statusColors: Record<string, string> = {
  normal: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  abnormal: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  resolved: 'bg-muted text-muted-foreground',
};

export default function MedicalHistory() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [medicalData, setMedicalData] = useState<MedicalDataItem[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);

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
        supabase.from('health_documents').select('id, file_name, ai_suggested_name, ai_summary, ai_suggested_category, uploaded_at, document_type').eq('user_id', user!.id).order('uploaded_at', { ascending: false }),
      ]);
      if (medRes.data) setMedicalData(medRes.data);
      if (docRes.data) setDocuments(docRes.data);
    } catch (error) {
      console.error('Error fetching medical history:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupedData = useMemo(() => {
    return medicalData.reduce<Record<string, MedicalDataItem[]>>((acc, item) => {
      const type = item.data_type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(item);
      return acc;
    }, {});
  }, [medicalData]);

  // Statistics calculations
  const stats = useMemo(() => {
    const statusCounts = { normal: 0, abnormal: 0, critical: 0, active: 0, resolved: 0, unknown: 0 };

    medicalData.forEach((item) => {
      if (item.status && statusCounts.hasOwnProperty(item.status)) {
        statusCounts[item.status as keyof typeof statusCounts]++;
      } else {
        statusCounts.unknown++;
      }
    });

    const abnormalCount = statusCounts.abnormal + statusCounts.critical;
    const activeConditions = medicalData.filter(i => i.data_type === 'condition' && i.status === 'active').length;
    const activeMedications = medicalData.filter(i => i.data_type === 'medication' && i.status === 'active').length;
    const labResults = medicalData.filter(i => i.data_type === 'lab_result');
    const normalLabs = labResults.filter(i => i.status === 'normal').length;
    const abnormalLabs = labResults.filter(i => i.status === 'abnormal').length;
    const criticalLabs = labResults.filter(i => i.status === 'critical').length;

    // Lab results with numeric values for charting
    const labsWithValues = labResults
      .filter(l => l.value && !isNaN(parseFloat(l.value)))
      .map(l => {
        const numVal = parseFloat(l.value!);
        let refLow: number | null = null;
        let refHigh: number | null = null;
        if (l.reference_range) {
          const rangeMatch = l.reference_range.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
          if (rangeMatch) {
            refLow = parseFloat(rangeMatch[1]);
            refHigh = parseFloat(rangeMatch[2]);
          }
        }
        let deviationPct = 0;
        if (refLow !== null && refHigh !== null) {
          const mid = (refLow + refHigh) / 2;
          deviationPct = mid > 0 ? Math.round(((numVal - mid) / mid) * 100) : 0;
        }
        return {
          ...l,
          numVal,
          refLow,
          refHigh,
          deviationPct,
          shortTitle: l.title.length > 18 ? l.title.slice(0, 16) + '…' : l.title,
        };
      });

    const labDeviationData = labsWithValues
      .filter(l => l.refLow !== null && l.refHigh !== null)
      .sort((a, b) => Math.abs(b.deviationPct) - Math.abs(a.deviationPct))
      .slice(0, 12)
      .map(l => ({
        name: l.shortTitle,
        deviation: l.deviationPct,
        value: l.numVal,
        unit: l.unit || '',
        refRange: l.reference_range || '',
        status: l.status,
        fill: l.status === 'critical' ? '#ef4444' : l.status === 'abnormal' ? '#eab308' : '#22c55e',
      }));

    // ===== ANALYTICS DATA =====

    // 1. Lab trends: group same-titled labs by date
    const labsByTitle: Record<string, typeof labsWithValues> = {};
    labsWithValues.forEach(l => {
      if (l.date_recorded) {
        const key = l.title;
        if (!labsByTitle[key]) labsByTitle[key] = [];
        labsByTitle[key].push(l);
      }
    });

    // Get labs that have trends (multiple readings or single with ref range)
    const labTrendData: Record<string, { data: { date: string; value: number; refLow: number | null; refHigh: number | null }[]; unit: string; latestStatus: string | null }> = {};
    Object.entries(labsByTitle).forEach(([title, labs]) => {
      const sorted = [...labs].sort((a, b) => new Date(a.date_recorded!).getTime() - new Date(b.date_recorded!).getTime());
      labTrendData[title] = {
        data: sorted.map(l => ({
          date: format(new Date(l.date_recorded!), 'MMM d'),
          value: l.numVal,
          refLow: l.refLow,
          refHigh: l.refHigh,
        })),
        unit: sorted[0].unit || '',
        latestStatus: sorted[sorted.length - 1].status,
      };
    });

    // 2. Health score over time (per document date)
    const docDates = documents
      .filter(d => d.uploaded_at && d.ai_summary)
      .map(d => ({ date: new Date(d.uploaded_at!), id: d.id }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const healthScoreTimeline = docDates.map(dd => {
      const docItems = medicalData.filter(m => m.document_id === dd.id);
      const totalLabs = docItems.filter(i => i.data_type === 'lab_result').length;
      const normalCount = docItems.filter(i => i.data_type === 'lab_result' && i.status === 'normal').length;
      const score = totalLabs > 0 ? Math.round((normalCount / totalLabs) * 100) : null;
      return {
        date: format(dd.date, 'MMM d, yyyy'),
        score,
        totalLabs,
        normalCount,
      };
    }).filter(d => d.score !== null);

    // 3. Timing analysis
    const sortedDates = documents
      .filter(d => d.uploaded_at)
      .map(d => new Date(d.uploaded_at!))
      .sort((a, b) => a.getTime() - b.getTime());
    
    let avgDaysBetweenDocs: number | null = null;
    let nextCheckupEstimate: Date | null = null;
    if (sortedDates.length >= 2) {
      const gaps = [];
      for (let i = 1; i < sortedDates.length; i++) {
        gaps.push(differenceInDays(sortedDates[i], sortedDates[i - 1]));
      }
      avgDaysBetweenDocs = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
      nextCheckupEstimate = addDays(sortedDates[sortedDates.length - 1], avgDaysBetweenDocs);
    }

    const lastDocDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
    const daysSinceLastDoc = lastDocDate ? differenceInDays(new Date(), lastDocDate) : null;

    // 4. Prediction insights from lab trends
    const predictions: { title: string; trend: 'improving' | 'worsening' | 'stable'; detail: string; icon: typeof TrendingUp }[] = [];
    Object.entries(labTrendData).forEach(([title, info]) => {
      if (info.data.length >= 2) {
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
          
          if (!wasInRange && isInRange) {
            trend = 'improving';
            detail = `Returned to normal range (${changePct > 0 ? '+' : ''}${changePct}%)`;
          } else if (wasInRange && !isInRange) {
            trend = 'worsening';
            detail = `Moved out of normal range (${changePct > 0 ? '+' : ''}${changePct}%)`;
          } else if (Math.abs(changePct) <= 5) {
            trend = 'stable';
            detail = `Stable within ${isInRange ? 'normal' : 'abnormal'} range`;
          } else if (isInRange) {
            trend = changePct > 0 && last > (refLow + refHigh) / 2 ? 'stable' : 'improving';
            detail = `${changePct > 0 ? '+' : ''}${changePct}% change, still in range`;
          } else {
            // Out of range
            const movingToward = (last > refHigh && changePct < 0) || (last < refLow && changePct > 0);
            trend = movingToward ? 'improving' : 'worsening';
            detail = `${movingToward ? 'Moving toward' : 'Moving away from'} normal range (${changePct > 0 ? '+' : ''}${changePct}%)`;
          }
        } else {
          if (Math.abs(changePct) <= 5) {
            trend = 'stable';
            detail = `Stable (${changePct > 0 ? '+' : ''}${changePct}%)`;
          } else {
            trend = changePct > 15 ? 'worsening' : changePct < -15 ? 'improving' : 'stable';
            detail = `${changePct > 0 ? '+' : ''}${changePct}% change over ${info.data.length} readings`;
          }
        }
        
        predictions.push({
          title,
          trend,
          detail,
          icon: trend === 'improving' ? TrendingUp : trend === 'worsening' ? TrendingDown : Minus,
        });
      }
    });

    // 5. Lab status distribution pie
    const labStatusPie = [
      { name: 'Normal', value: normalLabs, color: '#22c55e' },
      { name: 'Abnormal', value: abnormalLabs, color: '#eab308' },
      { name: 'Critical', value: criticalLabs, color: '#ef4444' },
    ].filter(d => d.value > 0);

    // 6. Overall health score
    const overallHealthScore = labResults.length > 0
      ? Math.round((normalLabs / labResults.length) * 100)
      : null;

    return {
      statusCounts, abnormalCount,
      activeConditions, activeMedications, labResults,
      labsWithValues, labDeviationData,
      normalLabs, abnormalLabs, criticalLabs,
      labTrendData, healthScoreTimeline,
      avgDaysBetweenDocs, nextCheckupEstimate, daysSinceLastDoc, lastDocDate,
      predictions, labStatusPie, overallHealthScore,
    };
  }, [medicalData, documents]);

  const dataTypes = Object.keys(typeConfig).filter((t) => groupedData[t]?.length);

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
  const analyzedDocs = documents.filter(d => d.ai_summary);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Medical History</h1>
            <p className="text-sm text-muted-foreground">AI-analyzed health data & statistics</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/welcome')}>
            <Home className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
        <DocumentUpload />

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full flex overflow-x-auto">
            <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
            <TabsTrigger value="analytics" className="flex-1">Analytics</TabsTrigger>
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
            <TabsTrigger value="timeline" className="flex-1">Timeline</TabsTrigger>
          </TabsList>

          {/* ============ OVERVIEW TAB ============ */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {!hasDocuments ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Stethoscope className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center mb-2 font-medium">No medical analysis yet</p>
                  <p className="text-sm text-muted-foreground text-center">Upload health documents to receive AI-powered medical analysis.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Lab Quick Summary */}
                {hasData && stats.labResults.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    <Card className="p-4 border-green-200 dark:border-green-900/40">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-muted-foreground">Normal</span>
                      </div>
                      <p className="text-2xl font-bold text-green-600">{stats.normalLabs}</p>
                      <p className="text-[10px] text-muted-foreground">lab tests in range</p>
                    </Card>
                    <Card className="p-4 border-yellow-200 dark:border-yellow-900/40">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span className="text-xs text-muted-foreground">Abnormal</span>
                      </div>
                      <p className="text-2xl font-bold text-yellow-600">{stats.abnormalLabs}</p>
                      <p className="text-[10px] text-muted-foreground">needs review</p>
                    </Card>
                    <Card className="p-4 border-red-200 dark:border-red-900/40">
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span className="text-xs text-muted-foreground">Critical</span>
                      </div>
                      <p className="text-2xl font-bold text-destructive">{stats.criticalLabs}</p>
                      <p className="text-[10px] text-muted-foreground">urgent attention</p>
                    </Card>
                  </div>
                )}

                {/* Flagged Results */}
                {stats.abnormalCount > 0 && (
                  <Card className="border-yellow-200 dark:border-yellow-900/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-yellow-600" />
                        Flagged Results
                        <Badge className="ml-auto bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-[10px]">
                          {stats.abnormalCount}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {medicalData
                        .filter(i => i.status === 'abnormal' || i.status === 'critical')
                        .map(item => (
                          <div key={item.id} className={`rounded-lg px-3 py-2.5 ${item.status === 'critical' ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30' : 'bg-yellow-50 dark:bg-yellow-900/10'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm font-medium">{item.title}</span>
                                <Badge className={`text-[9px] px-1.5 py-0 ${statusColors[item.status || ''] || 'bg-muted'}`}>
                                  {item.status}
                                </Badge>
                              </div>
                              {item.date_recorded && (
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(item.date_recorded), 'MMM d, yyyy')}
                                </span>
                              )}
                            </div>
                            {item.value && (
                              <p className="text-xs mt-1 font-mono">
                                <span className="font-semibold">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>
                                {item.reference_range && <span className="text-muted-foreground ml-2">(Ref: {item.reference_range})</span>}
                              </p>
                            )}
                            {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                )}

                {/* Lab Deviation Chart */}
                {stats.labDeviationData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Lab Values — Deviation from Normal
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">How far each result is from the reference range center</p>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={Math.max(180, stats.labDeviationData.length * 28)}>
                        <BarChart data={stats.labDeviationData} layout="vertical" margin={{ left: 5, right: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={70} />
                          <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeOpacity={0.4} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
                                  <p className="font-medium">{d.name}</p>
                                  <p>Value: {d.value} {d.unit}</p>
                                  <p>Ref: {d.refRange}</p>
                                  <p className={d.deviation > 0 ? 'text-yellow-600' : d.deviation < 0 ? 'text-blue-600' : 'text-green-600'}>
                                    {d.deviation > 0 ? '+' : ''}{d.deviation}% from midpoint
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="deviation" radius={[0, 4, 4, 0]} barSize={14}>
                            {stats.labDeviationData.map((entry, index) => (
                              <Cell key={`dev-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Lab Results Table */}
                {hasData && stats.labResults.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 text-primary" />
                        All Lab Results
                        <Badge variant="secondary" className="ml-auto text-[10px]">{stats.labResults.length} tests</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Test</th>
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">Value</th>
                              <th className="text-right py-2 px-3 font-medium text-muted-foreground">Reference</th>
                              <th className="text-center py-2 px-3 font-medium text-muted-foreground">Status</th>
                              <th className="text-right py-2 pl-3 font-medium text-muted-foreground">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.labResults.map(lab => {
                              const isHigh = lab.status === 'abnormal' || lab.status === 'critical';
                              return (
                                <tr key={lab.id} className={`border-b border-border/50 last:border-0 ${isHigh ? 'bg-yellow-50/50 dark:bg-yellow-900/5' : ''}`}>
                                  <td className="py-2 pr-3 font-medium">{lab.title}</td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                                    <span className={isHigh ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}>
                                      {lab.value || '—'}{lab.unit ? ` ${lab.unit}` : ''}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right text-muted-foreground">{lab.reference_range || '—'}</td>
                                  <td className="py-2 px-3 text-center">
                                    {lab.status && (
                                      <Badge className={`text-[9px] px-1.5 py-0 ${statusColors[lab.status] || 'bg-muted'}`}>
                                        {lab.status}
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="py-2 pl-3 text-right text-muted-foreground whitespace-nowrap">
                                    {lab.date_recorded ? format(new Date(lab.date_recorded), 'MMM d, yyyy') : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Active Conditions & Medications */}
                {(stats.activeConditions > 0 || stats.activeMedications > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stats.activeConditions > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Stethoscope className="h-4 w-4 text-destructive" />
                            Active Conditions
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {medicalData.filter(i => i.data_type === 'condition' && i.status === 'active').map(item => (
                            <div key={item.id} className="flex items-center justify-between bg-destructive/5 rounded-lg px-3 py-2">
                              <div>
                                <span className="text-sm font-medium">{item.title}</span>
                                {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                              </div>
                              {item.date_recorded && (
                                <span className="text-[10px] text-muted-foreground">{format(new Date(item.date_recorded), 'MMM d, yyyy')}</span>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                    {stats.activeMedications > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Pill className="h-4 w-4 text-primary" />
                            Current Medications
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {medicalData.filter(i => i.data_type === 'medication' && i.status === 'active').map(item => (
                            <div key={item.id} className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2">
                              <div>
                                <span className="text-sm font-medium">{item.title}</span>
                                {item.value && <span className="text-xs text-muted-foreground ml-2">{item.value}</span>}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* Doctor Conclusions */}
                {analyzedDocs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Doctor Conclusions & Summaries
                    </h3>
                    <div className="space-y-3">
                      {analyzedDocs.map((doc) => (
                        <Card key={doc.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <FileText className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-semibold">{doc.ai_suggested_name || doc.file_name}</h4>
                                  <Badge variant="outline" className="text-[10px]">
                                    {doc.ai_suggested_category || doc.document_type}
                                  </Badge>
                                  {doc.uploaded_at && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                                    </span>
                                  )}
                                </div>
                                <div className="bg-muted/40 rounded-lg p-3 mt-2 border border-border/50">
                                  <p className="text-sm leading-relaxed">{doc.ai_summary}</p>
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

          {/* ============ ANALYTICS TAB ============ */}
          <TabsContent value="analytics" className="space-y-4 mt-4">
            {!hasData ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center mb-2 font-medium">No analytics available yet</p>
                  <p className="text-sm text-muted-foreground text-center">Upload health documents to see trends, predictions, and statistics.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Health Score & Timing Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {stats.overallHealthScore !== null && (
                    <Card className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground">Health Score</span>
                      </div>
                      <p className={`text-2xl font-bold ${stats.overallHealthScore >= 80 ? 'text-green-600' : stats.overallHealthScore >= 50 ? 'text-yellow-600' : 'text-destructive'}`}>
                        {stats.overallHealthScore}%
                      </p>
                      <Progress value={stats.overallHealthScore} className="h-1.5 mt-1" />
                      <p className="text-[10px] text-muted-foreground mt-1">based on {stats.labResults.length} lab tests</p>
                    </Card>
                  )}
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground">Last Checkup</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {stats.daysSinceLastDoc !== null ? `${stats.daysSinceLastDoc}d` : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {stats.lastDocDate ? `on ${format(stats.lastDocDate, 'MMM d')}` : 'no records'}
                    </p>
                  </Card>
                  {stats.avgDaysBetweenDocs !== null && (
                    <Card className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground">Avg Interval</span>
                      </div>
                      <p className="text-2xl font-bold">{stats.avgDaysBetweenDocs}d</p>
                      <p className="text-[10px] text-muted-foreground">between checkups</p>
                    </Card>
                  )}
                  {stats.nextCheckupEstimate && (
                    <Card className="p-4 border-primary/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground">Next Checkup</span>
                      </div>
                      <p className="text-lg font-bold">{format(stats.nextCheckupEstimate, 'MMM d')}</p>
                      <p className="text-[10px] text-muted-foreground">estimated from pattern</p>
                    </Card>
                  )}
                </div>

                {/* Predictions / Trend Insights */}
                {stats.predictions.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        Trend Predictions
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">Based on changes across your lab results over time</p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {stats.predictions.map((pred, i) => {
                        const Icon = pred.icon;
                        const colorClass = pred.trend === 'improving'
                          ? 'text-green-600 bg-green-50 dark:bg-green-900/10'
                          : pred.trend === 'worsening'
                          ? 'text-red-600 bg-red-50 dark:bg-red-900/10'
                          : 'text-muted-foreground bg-muted/50';
                        return (
                          <div key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${colorClass}`}>
                            <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{pred.title}</span>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                  {pred.trend}
                                </Badge>
                              </div>
                              <p className="text-xs mt-0.5 opacity-80">{pred.detail}</p>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Health Score Over Time */}
                {stats.healthScoreTimeline.length > 1 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        Health Score Over Time
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">% of lab results within normal range per checkup</p>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={stats.healthScoreTimeline} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                          <defs>
                            <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "Good", position: "insideTopRight", fontSize: 9, fill: "#22c55e" }} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
                                  <p className="font-medium">{d.date}</p>
                                  <p className="text-green-600 font-semibold">{d.score}% healthy</p>
                                  <p className="text-muted-foreground">{d.normalCount}/{d.totalLabs} normal results</p>
                                </div>
                              );
                            }}
                          />
                          <Area type="monotone" dataKey="score" stroke="#22c55e" fill="url(#healthGrad)" strokeWidth={2} dot={{ r: 4, fill: '#22c55e' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Lab Trend Lines */}
                {Object.keys(stats.labTrendData).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Lab Value Trends
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(stats.labTrendData)
                        .filter(([, info]) => info.data.length >= 1)
                        .slice(0, 8)
                        .map(([title, info]) => {
                          const hasRefRange = info.data.some(d => d.refLow !== null && d.refHigh !== null);
                          const refLow = info.data.find(d => d.refLow !== null)?.refLow ?? undefined;
                          const refHigh = info.data.find(d => d.refHigh !== null)?.refHigh ?? undefined;
                          const latestVal = info.data[info.data.length - 1].value;
                          const statusColor = info.latestStatus === 'critical' ? 'text-destructive' : info.latestStatus === 'abnormal' ? 'text-yellow-600' : 'text-green-600';

                          return (
                            <Card key={title}>
                              <CardHeader className="pb-1">
                                <CardTitle className="text-xs flex items-center justify-between">
                                  <span className="truncate">{title}</span>
                                  <span className={`font-mono text-sm ${statusColor}`}>
                                    {latestVal}{info.unit ? ` ${info.unit}` : ''}
                                  </span>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                {info.data.length >= 2 ? (
                                  <ResponsiveContainer width="100%" height={120}>
                                    <ComposedChart data={info.data} margin={{ left: 0, right: 5, top: 5, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                      <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                                      <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                                      {hasRefRange && refLow !== undefined && refHigh !== undefined && (
                                        <ReferenceArea y1={refLow} y2={refHigh} fill="#22c55e" fillOpacity={0.08} label={{ value: "Normal", position: "insideTopLeft", fontSize: 8, fill: "#22c55e" }} />
                                      )}
                                      <Tooltip
                                        content={({ active, payload }) => {
                                          if (!active || !payload?.length) return null;
                                          const d = payload[0].payload;
                                          return (
                                            <div className="bg-background border border-border rounded-lg px-2 py-1.5 shadow-lg text-xs">
                                              <p>{d.date}: <span className="font-semibold">{d.value}{info.unit ? ` ${info.unit}` : ''}</span></p>
                                              {d.refLow !== null && <p className="text-muted-foreground">Ref: {d.refLow}–{d.refHigh}</p>}
                                            </div>
                                          );
                                        }}
                                      />
                                      <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))' }} />
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                ) : (
                                  <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">
                                    <div className="text-center">
                                      <p className="font-mono text-lg">{latestVal}{info.unit ? ` ${info.unit}` : ''}</p>
                                      {hasRefRange && <p className="text-[10px]">Ref: {refLow}–{refHigh}</p>}
                                      <p className="text-[10px] mt-1">Single reading — trends need ≥2</p>
                                    </div>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Lab Status Distribution */}
                {stats.labStatusPie.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FlaskConical className="h-4 w-4 text-primary" />
                          Lab Status Distribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                          <RechartsPie>
                            <Pie
                              data={stats.labStatusPie}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={75}
                              paddingAngle={4}
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                            >
                              {stats.labStatusPie.map((entry, index) => (
                                <Cell key={`pie-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => [value, 'Tests']} />
                          </RechartsPie>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Checkup Frequency */}
                    {documents.length >= 2 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Clock className="h-4 w-4 text-primary" />
                            Checkup Timing
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Total documents</span>
                              <span className="font-semibold">{documents.length}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">AI-analyzed</span>
                              <span className="font-semibold">{analyzedDocs.length}</span>
                            </div>
                            {stats.avgDaysBetweenDocs !== null && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Avg interval</span>
                                <span className="font-semibold">{stats.avgDaysBetweenDocs} days</span>
                              </div>
                            )}
                            {stats.daysSinceLastDoc !== null && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Since last checkup</span>
                                <span className={`font-semibold ${stats.daysSinceLastDoc > (stats.avgDaysBetweenDocs || 90) ? 'text-yellow-600' : 'text-green-600'}`}>
                                  {stats.daysSinceLastDoc} days
                                </span>
                              </div>
                            )}
                            {stats.nextCheckupEstimate && (
                              <>
                                <div className="border-t border-border pt-2 mt-2">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Predicted next</span>
                                    <span className="font-semibold text-primary">
                                      {format(stats.nextCheckupEstimate, 'MMM d, yyyy')}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    {differenceInDays(stats.nextCheckupEstimate, new Date()) > 0
                                      ? `In ${differenceInDays(stats.nextCheckupEstimate, new Date())} days`
                                      : `${Math.abs(differenceInDays(stats.nextCheckupEstimate, new Date()))} days overdue`
                                    }
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ============ DETAILS TAB ============ */}
          <TabsContent value="details" className="space-y-4 mt-4">
            {dataTypes.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">No extracted data yet.</p>
                </CardContent>
              </Card>
            ) : (
              dataTypes.map((type) => {
                const config = typeConfig[type] || { icon: Activity, label: type, color: 'text-foreground', bgColor: 'bg-muted' };
                const Icon = config.icon;
                const items = groupedData[type];
                return (
                  <Card key={type}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className={`h-5 w-5 ${config.color}`} />
                        {config.label}
                        <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 pb-3 border-b last:border-0 last:pb-0">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{item.title}</div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {item.value && (
                                <span className="text-sm font-semibold">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>
                              )}
                              {item.reference_range && (
                                <span className="text-xs text-muted-foreground">(Ref: {item.reference_range})</span>
                              )}
                              {item.status && (
                                <Badge className={`text-[10px] px-1.5 py-0 ${statusColors[item.status] || 'bg-muted'}`}>{item.status}</Badge>
                              )}
                            </div>
                            {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                          </div>
                          {item.date_recorded && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(item.date_recorded), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* ============ DOCUMENTS TAB ============ */}
          <TabsContent value="documents" className="space-y-4 mt-4">
            {documents.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">No documents uploaded yet.</p>
                </CardContent>
              </Card>
            ) : (
              documents.map((doc) => (
                <Card key={doc.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <FileText className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm">{doc.ai_suggested_name || doc.file_name}</h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{doc.ai_suggested_category || doc.document_type}</Badge>
                          {doc.uploaded_at && (
                            <span className="text-xs text-muted-foreground">{format(new Date(doc.uploaded_at), 'MMM d, yyyy')}</span>
                          )}
                        </div>
                        {doc.ai_summary && (
                          <div className="bg-muted/50 rounded-lg p-3 mt-2">
                            <p className="text-xs leading-relaxed">{doc.ai_summary}</p>
                          </div>
                        )}
                        {medicalData.filter(m => m.document_id === doc.id).length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Extracted Data</p>
                            {medicalData.filter(m => m.document_id === doc.id).map(item => (
                              <div key={item.id} className="flex items-center gap-2 text-xs">
                                <Badge variant="outline" className="text-[9px] px-1">{item.data_type}</Badge>
                                <span className="font-medium">{item.title}</span>
                                {item.value && <span className="text-muted-foreground">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>}
                                {item.status && (
                                  <Badge className={`text-[9px] px-1 py-0 ${statusColors[item.status] || 'bg-muted'}`}>{item.status}</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ============ TIMELINE TAB ============ */}
          <TabsContent value="timeline" className="mt-4">
            {medicalData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">No timeline data available yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                <div className="space-y-4">
                  {medicalData
                    .filter(item => item.date_recorded)
                    .sort((a, b) => new Date(b.date_recorded!).getTime() - new Date(a.date_recorded!).getTime())
                    .map((item) => {
                      const config = typeConfig[item.data_type] || { icon: Activity, label: item.data_type, color: 'text-foreground', bgColor: 'bg-muted' };
                      const Icon = config.icon;
                      return (
                        <div key={item.id} className="relative pl-10">
                          <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 border-background ${item.status === 'critical' ? 'bg-destructive' : item.status === 'abnormal' ? 'bg-yellow-500' : 'bg-primary'}`} />
                          <Card className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 flex-1">
                                <Icon className={`h-4 w-4 mt-0.5 ${config.color} flex-shrink-0`} />
                                <div className="min-w-0">
                                  <p className="font-medium text-sm">{item.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {item.value && <span className="text-xs font-semibold">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>}
                                    {item.status && (
                                      <Badge className={`text-[10px] px-1.5 py-0 ${statusColors[item.status] || 'bg-muted'}`}>{item.status}</Badge>
                                    )}
                                  </div>
                                  {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                                </div>
                              </div>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {format(new Date(item.date_recorded!), 'MMM d, yyyy')}
                              </span>
                            </div>
                          </Card>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
