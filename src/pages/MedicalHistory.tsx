import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const typeConfig: Record<string, { icon: typeof Activity; label: string; color: string }> = {
  condition: { icon: Stethoscope, label: 'Conditions', color: 'text-destructive' },
  medication: { icon: Pill, label: 'Medications', color: 'text-primary' },
  lab_result: { icon: FlaskConical, label: 'Lab Results', color: 'text-secondary' },
  cycle_info: { icon: Calendar, label: 'Cycle Info', color: 'text-accent' },
  allergy: { icon: AlertTriangle, label: 'Allergies', color: 'text-destructive' },
  procedure: { icon: Activity, label: 'Procedures', color: 'text-primary' },
  vaccination: { icon: Syringe, label: 'Vaccinations', color: 'text-secondary' },
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
    if (!authLoading && !user) {
      navigate('/auth/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [medRes, docRes] = await Promise.all([
        supabase
          .from('medical_extracted_data')
          .select('*')
          .order('date_recorded', { ascending: false, nullsFirst: false }),
        supabase
          .from('health_documents')
          .select('id, file_name, ai_suggested_name, ai_summary, ai_suggested_category, uploaded_at, document_type')
          .order('uploaded_at', { ascending: false }),
      ]);

      if (medRes.data) setMedicalData(medRes.data);
      if (docRes.data) setDocuments(docRes.data);
    } catch (error) {
      console.error('Error fetching medical history:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupedData = medicalData.reduce<Record<string, MedicalDataItem[]>>((acc, item) => {
    const type = item.data_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  const dataTypes = Object.keys(typeConfig).filter((t) => groupedData[t]?.length);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

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
            <p className="text-sm text-muted-foreground">
              Data extracted from your uploaded documents
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
        {/* Upload CTA */}
        <DocumentUpload />

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full flex overflow-x-auto">
            <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
            <TabsTrigger value="documents" className="flex-1">Documents</TabsTrigger>
            <TabsTrigger value="timeline" className="flex-1">Timeline</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {dataTypes.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center mb-4">
                    No medical data extracted yet. Upload health documents to see your medical history here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              dataTypes.map((type) => {
                const config = typeConfig[type] || { icon: Activity, label: type, color: 'text-foreground' };
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
                                <span className="text-sm font-semibold">
                                  {item.value}{item.unit ? ` ${item.unit}` : ''}
                                </span>
                              )}
                              {item.reference_range && (
                                <span className="text-xs text-muted-foreground">
                                  (Ref: {item.reference_range})
                                </span>
                              )}
                              {item.status && (
                                <Badge className={`text-[10px] px-1.5 py-0 ${statusColors[item.status] || 'bg-muted'}`}>
                                  {item.status}
                                </Badge>
                              )}
                            </div>
                            {item.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                            )}
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

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4 mt-4">
            {documents.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    No documents uploaded yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              documents.map((doc) => (
                <Card key={doc.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <FileText className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm">
                          {doc.ai_suggested_name || doc.file_name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            {doc.ai_suggested_category || doc.document_type}
                          </Badge>
                          {doc.uploaded_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                        {doc.ai_summary && (
                          <div className="bg-muted/50 rounded-lg p-3 mt-2">
                            <p className="text-xs leading-relaxed">{doc.ai_summary}</p>
                          </div>
                        )}
                        {/* Show extracted data for this document */}
                        {medicalData.filter(m => m.document_id === doc.id).length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Extracted Data</p>
                            {medicalData.filter(m => m.document_id === doc.id).map(item => (
                              <div key={item.id} className="flex items-center gap-2 text-xs">
                                <Badge variant="outline" className="text-[9px] px-1">
                                  {item.data_type}
                                </Badge>
                                <span className="font-medium">{item.title}</span>
                                {item.value && <span className="text-muted-foreground">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>}
                                {item.status && (
                                  <Badge className={`text-[9px] px-1 py-0 ${statusColors[item.status] || 'bg-muted'}`}>
                                    {item.status}
                                  </Badge>
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

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-4">
            {medicalData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    No timeline data available yet.
                  </p>
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
                      const config = typeConfig[item.data_type] || { icon: Activity, label: item.data_type, color: 'text-foreground' };
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
                                    {item.value && (
                                      <span className="text-xs font-semibold">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>
                                    )}
                                    {item.status && (
                                      <Badge className={`text-[10px] px-1.5 py-0 ${statusColors[item.status] || 'bg-muted'}`}>
                                        {item.status}
                                      </Badge>
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
