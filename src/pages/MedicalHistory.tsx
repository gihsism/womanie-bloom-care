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
  BarChart3,
  PieChart,
  Heart,
} from 'lucide-react';
import { format } from 'date-fns';

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
        supabase.from('medical_extracted_data').select('*').order('date_recorded', { ascending: false, nullsFirst: false }),
        supabase.from('health_documents').select('id, file_name, ai_suggested_name, ai_summary, ai_suggested_category, uploaded_at, document_type').order('uploaded_at', { ascending: false }),
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
    const typeCounts: Record<string, number> = {};

    medicalData.forEach((item) => {
      if (item.status && statusCounts.hasOwnProperty(item.status)) {
        statusCounts[item.status as keyof typeof statusCounts]++;
      } else {
        statusCounts.unknown++;
      }
      const t = item.data_type || 'other';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    const totalFindings = medicalData.length;
    const normalPercent = totalFindings > 0 ? Math.round((statusCounts.normal / totalFindings) * 100) : 0;
    const abnormalCount = statusCounts.abnormal + statusCounts.critical;
    const activeConditions = medicalData.filter(i => i.data_type === 'condition' && i.status === 'active').length;
    const activeMedications = medicalData.filter(i => i.data_type === 'medication' && i.status === 'active').length;
    const labResults = medicalData.filter(i => i.data_type === 'lab_result');
    const normalLabs = labResults.filter(i => i.status === 'normal').length;
    const labNormalPercent = labResults.length > 0 ? Math.round((normalLabs / labResults.length) * 100) : 0;

    return { statusCounts, typeCounts, totalFindings, normalPercent, abnormalCount, activeConditions, activeMedications, labResults, labNormalPercent };
  }, [medicalData]);

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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Medical History</h1>
            <p className="text-sm text-muted-foreground">AI-analyzed health data & statistics</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
        <DocumentUpload />

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full flex overflow-x-auto">
            <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
            <TabsTrigger value="timeline" className="flex-1">Timeline</TabsTrigger>
          </TabsList>

          {/* ============ OVERVIEW TAB - STATISTICS ============ */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {!hasData && !hasDocuments ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center mb-2 font-medium">No medical data yet</p>
                  <p className="text-sm text-muted-foreground text-center">Upload health documents to see AI-generated statistics and insights here.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Summary Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground">Documents</span>
                    </div>
                    <p className="text-2xl font-bold">{documents.length}</p>
                    <p className="text-[10px] text-muted-foreground">{analyzedDocs.length} analyzed</p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-4 w-4 text-secondary" />
                      <span className="text-xs text-muted-foreground">Findings</span>
                    </div>
                    <p className="text-2xl font-bold">{stats.totalFindings}</p>
                    <p className="text-[10px] text-muted-foreground">{dataTypes.length} categories</p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-xs text-muted-foreground">Normal</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{stats.normalPercent}%</p>
                    <p className="text-[10px] text-muted-foreground">{stats.statusCounts.normal} findings</p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <span className="text-xs text-muted-foreground">Attention</span>
                    </div>
                    <p className="text-2xl font-bold text-yellow-600">{stats.abnormalCount}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {stats.statusCounts.critical > 0 ? `${stats.statusCounts.critical} critical` : 'abnormal findings'}
                    </p>
                  </Card>
                </div>

                {/* Health Score / Lab Results Bar */}
                {stats.labResults.length > 0 && (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 text-secondary" />
                        <span className="text-sm font-semibold">Lab Results Health Score</span>
                      </div>
                      <span className="text-lg font-bold">{stats.labNormalPercent}%</span>
                    </div>
                    <Progress value={stats.labNormalPercent} className="h-3" />
                    <div className="flex justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">
                        {stats.labResults.filter(i => i.status === 'normal').length} normal
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {stats.labResults.filter(i => i.status !== 'normal').length} flagged
                      </span>
                    </div>
                  </Card>
                )}

                {/* Active Conditions & Medications */}
                {(stats.activeConditions > 0 || stats.activeMedications > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {stats.activeConditions > 0 && (
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Stethoscope className="h-4 w-4 text-destructive" />
                          <span className="text-sm font-semibold">Active Conditions</span>
                        </div>
                        <div className="space-y-2">
                          {medicalData.filter(i => i.data_type === 'condition' && i.status === 'active').map(item => (
                            <div key={item.id} className="flex items-center justify-between bg-destructive/5 rounded-lg px-3 py-2">
                              <span className="text-sm font-medium">{item.title}</span>
                              {item.date_recorded && (
                                <span className="text-[10px] text-muted-foreground">
                                  since {format(new Date(item.date_recorded), 'MMM yyyy')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                    {stats.activeMedications > 0 && (
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Pill className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold">Current Medications</span>
                        </div>
                        <div className="space-y-2">
                          {medicalData.filter(i => i.data_type === 'medication' && i.status === 'active').map(item => (
                            <div key={item.id} className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2">
                              <div>
                                <span className="text-sm font-medium">{item.title}</span>
                                {item.value && <span className="text-xs text-muted-foreground ml-2">{item.value}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {/* Category Breakdown */}
                {dataTypes.length > 0 && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <PieChart className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Data by Category</span>
                    </div>
                    <div className="space-y-3">
                      {dataTypes.map((type) => {
                        const config = typeConfig[type] || { icon: Activity, label: type, color: 'text-foreground', bgColor: 'bg-muted' };
                        const Icon = config.icon;
                        const count = stats.typeCounts[type] || 0;
                        const percent = stats.totalFindings > 0 ? Math.round((count / stats.totalFindings) * 100) : 0;
                        return (
                          <div key={type}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-md ${config.bgColor} flex items-center justify-center`}>
                                  <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                                </div>
                                <span className="text-sm font-medium">{config.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{count}</span>
                                <span className="text-[10px] text-muted-foreground w-8 text-right">{percent}%</span>
                              </div>
                            </div>
                            <Progress value={percent} className="h-1.5" />
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Status Distribution */}
                {hasData && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="h-4 w-4 text-secondary" />
                      <span className="text-sm font-semibold">Status Distribution</span>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                      {[
                        { key: 'normal', label: 'Normal', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
                        { key: 'abnormal', label: 'Abnormal', icon: TrendingDown, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
                        { key: 'critical', label: 'Critical', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
                        { key: 'active', label: 'Active', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                        { key: 'resolved', label: 'Resolved', icon: Heart, color: 'text-muted-foreground', bg: 'bg-muted' },
                      ].map(({ key, label, icon: StatusIcon, color, bg }) => {
                        const count = stats.statusCounts[key as keyof typeof stats.statusCounts];
                        if (count === 0) return null;
                        return (
                          <div key={key} className={`${bg} rounded-lg p-3 text-center`}>
                            <StatusIcon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
                            <p className={`text-lg font-bold ${color}`}>{count}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{label}</p>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Document Summaries */}
                {analyzedDocs.length > 0 && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">AI Document Summaries</span>
                    </div>
                    <div className="space-y-3">
                      {analyzedDocs.map(doc => (
                        <div key={doc.id} className="bg-muted/30 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-sm font-semibold">{doc.ai_suggested_name || doc.file_name}</h4>
                            <Badge variant="outline" className="text-[10px] flex-shrink-0">
                              {doc.ai_suggested_category || doc.document_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{doc.ai_summary}</p>
                          {doc.uploaded_at && (
                            <p className="text-[10px] text-muted-foreground mt-2">
                              Uploaded {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Flagged Items */}
                {stats.abnormalCount > 0 && (
                  <Card className="p-4 border-yellow-200 dark:border-yellow-900/50">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm font-semibold">Items Requiring Attention</span>
                    </div>
                    <div className="space-y-2">
                      {medicalData
                        .filter(i => i.status === 'abnormal' || i.status === 'critical')
                        .map(item => (
                          <div key={item.id} className="flex items-start justify-between gap-2 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{item.title}</span>
                                <Badge className={`text-[9px] px-1 py-0 ${statusColors[item.status || ''] || 'bg-muted'}`}>
                                  {item.status}
                                </Badge>
                              </div>
                              {item.value && (
                                <span className="text-xs text-muted-foreground">
                                  {item.value}{item.unit ? ` ${item.unit}` : ''}
                                  {item.reference_range ? ` (Ref: ${item.reference_range})` : ''}
                                </span>
                              )}
                            </div>
                            {item.date_recorded && (
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {format(new Date(item.date_recorded), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ============ DETAILS TAB (old overview) ============ */}
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
