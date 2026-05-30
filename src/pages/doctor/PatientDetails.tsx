import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { useRequireRole } from '@/hooks/useRequireRole';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  FileText,
  Calendar,
  Activity,
  Plus,
  Heart,
  Droplet,
  MessageSquare,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import DoctorPatientTrackingSummary from '@/components/dashboard/DoctorPatientTrackingSummary';

interface PatientProfile {
  id: string;
  full_name: string | null;
  life_stage: string | null;
  pregnancy_due_date: string | null;
  ivf_phase: string | null;
}

interface HealthSignal {
  id: string;
  signal_date: string;
  symptoms: string[] | null;
  mood: string[] | null;
  discharge: string | null;
  notes: string | null;
}

interface HealthDocument {
  id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  ai_summary: string | null;
  ai_suggested_name: string | null;
  uploaded_at: string | null;
}

interface DoctorNote {
  id: string;
  title: string;
  content: string;
  note_type: string | null;
  created_at: string;
  is_visible_to_patient: boolean | null;
}

interface Appointment {
  id: string;
  scheduled_at: string;
  status: string | null;
  consultation_type: string | null;
  notes: string | null;
}

interface MedicalDataRow {
  id: string;
  document_id: string;
  title: string;
  value: string | number | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null; // 'normal' | 'high' | 'low' | 'critical' etc
  data_type: string | null;
  date_recorded: string | null;
  notes: string | null;
  raw_data: { panel?: string | null } | null;
}

const PatientDetails = () => {
  const navigate = useNavigate();
  usePageTitle('Patient Details');
  const { patientId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { hasRole, loading } = useRequireRole('doctor', '/auth/doctor-login');
  const { user } = useAuth();
  
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [healthSignals, setHealthSignals] = useState<HealthSignal[]>([]);
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  const [doctorNotes, setDoctorNotes] = useState<DoctorNote[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [medicalData, setMedicalData] = useState<MedicalDataRow[]>([]);
  const [periodRecords, setPeriodRecords] = useState<Array<{ period_start_date: string; cycle_length: number }>>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  
  // New note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [newNote, setNewNote] = useState({
    title: '',
    content: '',
    note_type: 'observation',
    is_visible_to_patient: true,
  });
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Deep-link support: arriving at /doctor/patient/:id?addNote=visit&date=2026-05-19
  // opens the Notes tab with the note form already expanded and the
  // title pre-filled. Doctors hit this from the "Add visit note" action
  // after marking an appointment completed on the DoctorDashboard.
  useEffect(() => {
    const intent = searchParams.get('addNote');
    if (!intent) return;
    const dateParam = searchParams.get('date');
    const visitDate = dateParam ? new Date(dateParam) : new Date();
    const prettyDate = isNaN(visitDate.getTime())
      ? new Date().toLocaleDateString()
      : visitDate.toLocaleDateString();
    setActiveTab('notes');
    setShowNoteForm(true);
    setNewNote(n => ({
      ...n,
      title: intent === 'visit' ? `Visit on ${prettyDate}` : n.title,
      note_type: intent === 'visit' ? 'observation' : n.note_type,
    }));
    // Strip the query so a refresh doesn't re-trigger.
    searchParams.delete('addNote');
    searchParams.delete('date');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Deep-link support: ?tab=documents / labs / notes / health / overview
  // jumps straight to the named tab. Used from the doctor dashboard
  // "N new" upload pill so the doctor lands on the documents view
  // without an extra click. Validated against the tab list to keep
  // unknown values from breaking the Tabs component.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;
    const valid = ['overview', 'health', 'labs', 'documents', 'notes'];
    if (valid.includes(tab)) setActiveTab(tab);
    searchParams.delete('tab');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Inline edit state for an existing note. Only one note is editable at
  // a time; the form replaces the read-only display for that row.
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState({
    title: '',
    content: '',
    note_type: 'observation',
    is_visible_to_patient: true,
  });
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [notesQuery, setNotesQuery] = useState('');
  const [notesTypeFilter, setNotesTypeFilter] = useState<string>('all');
  const [docsQuery, setDocsQuery] = useState('');
  const [docsCategoryFilter, setDocsCategoryFilter] = useState<string>('all');

  const startEditingNote = (note: DoctorNote) => {
    setEditingNoteId(note.id);
    setEditingNote({
      title: note.title,
      content: note.content,
      note_type: note.note_type || 'observation',
      is_visible_to_patient: note.is_visible_to_patient ?? true,
    });
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
  };

  const handleUpdateNote = async () => {
    if (!user || !editingNoteId || !editingNote.title || !editingNote.content) return;
    setIsUpdatingNote(true);
    try {
      const { error } = await db
        .from('doctor_notes')
        .update({
          title: editingNote.title,
          content: editingNote.content,
          note_type: editingNote.note_type,
          is_visible_to_patient: editingNote.is_visible_to_patient,
        })
        .eq('id', editingNoteId);
      if (error) throw error;
      toast({ title: 'Note updated' });
      setEditingNoteId(null);
      checkAccessAndLoadData();
    } catch (error) {
      console.error('Error updating note:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update note.' });
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Delete this clinical note? This cannot be undone.')) return;
    setDeletingNoteId(noteId);
    try {
      const { error } = await db.from('doctor_notes').delete().eq('id', noteId);
      if (error) throw error;
      toast({ title: 'Note deleted' });
      checkAccessAndLoadData();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete note.' });
    } finally {
      setDeletingNoteId(null);
    }
  };

  useEffect(() => {
    if (user && patientId) {
      checkAccessAndLoadData();
    }
  }, [user, patientId]);

  const checkAccessAndLoadData = async () => {
    if (!user || !patientId) return;
    setIsLoadingData(true);

    try {
      // One consent-gated server call fetches profile + signals +
      // documents + extracted data + our notes + appointments.
      // /api/db can't do this for a doctor because the rows are
      // owned by the patient — see api/doctors/patient.ts.
      const resp = await fetch(`/api/doctors/patient?id=${encodeURIComponent(patientId!)}`);
      if (resp.status === 403) {
        setHasAccess(false);
        toast({
          variant: 'destructive',
          title: 'Access denied',
          description: 'You do not have permission to view this patient\'s data.',
        });
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      setHasAccess(true);
      setPatient(payload.profile);
      setHealthSignals(payload.healthSignals || []);
      setDocuments(payload.documents || []);
      setDoctorNotes(payload.notes || []);
      setAppointments(payload.appointments || []);
      setMedicalData(payload.medicalData || []);
      setPeriodRecords(payload.periodRecords || []);
    } catch (error) {
      console.error('Error loading patient data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load patient data.',
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleAddNote = async () => {
    if (!user || !patientId || !newNote.title || !newNote.content) return;
    setIsSavingNote(true);

    try {
      const { error } = await db
        .from('doctor_notes')
        .insert({
          doctor_id: user.id,
          patient_id: patientId,
          title: newNote.title,
          content: newNote.content,
          note_type: newNote.note_type,
          is_visible_to_patient: newNote.is_visible_to_patient,
        });

      if (error) throw error;

      toast({
        title: 'Note added',
        description: 'Your note has been saved to the patient\'s record.',
      });

      setNewNote({
        title: '',
        content: '',
        note_type: 'observation',
        is_visible_to_patient: true,
      });
      setShowNoteForm(false);
      checkAccessAndLoadData();
    } catch (error) {
      console.error('Error adding note:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add note.',
      });
    } finally {
      setIsSavingNote(false);
    }
  };

  if (loading || isLoadingData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-16" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-[500px]" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">You do not have access to this patient's data.</p>
        <Button onClick={() => navigate('/doctor/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/doctor/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">{patient?.full_name || 'Patient'}</h1>
              <p className="text-sm text-muted-foreground">
                Life stage: {patient?.life_stage
                  ? patient.life_stage.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                  : 'Not specified'}
                {/* Mode-specific anchor data, surfaced inline so the
                    doctor sees "where she is" without opening another
                    tab. Pregnancy week + days-to-due / IVF phase are
                    both already on the patient's profile. */}
                {patient?.pregnancy_due_date && (() => {
                  const due = new Date(patient.pregnancy_due_date);
                  if (Number.isNaN(due.getTime())) return null;
                  const daysToDue = Math.round((due.getTime() - Date.now()) / 86_400_000);
                  const totalDays = 280 - daysToDue;
                  const weeks = Math.max(0, Math.min(42, Math.floor(totalDays / 7)));
                  return (
                    <span className="ml-2 text-primary font-medium">
                      · Week {weeks}{daysToDue > 0 ? ` (${daysToDue}d to due)` : daysToDue === 0 ? ' (due today)' : ` (${Math.abs(daysToDue)}d past due)`}
                    </span>
                  );
                })()}
                {patient?.ivf_phase && (
                  <span className="ml-2 text-primary font-medium">
                    · IVF: {patient.ivf_phase}
                  </span>
                )}
              </p>
            </div>
            <Button onClick={() => setShowNoteForm(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
            <button type="button" onClick={() => { window.location.href = '/'; }} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity ml-2">
              Womanie
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-5 lg:w-[600px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="health">Health Data</TabsTrigger>
            <TabsTrigger value="labs">Lab Results</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Health Logs</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{healthSignals.length}</div>
                  <p className="text-xs text-muted-foreground">Last 30 days</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Documents</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{documents.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {medicalData.length > 0 ? `${medicalData.length} extracted values` : 'Uploaded files'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Appointments</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{appointments.length}</div>
                  <p className="text-xs text-muted-foreground">Total sessions</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Your Notes</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{doctorNotes.length}</div>
                  <p className="text-xs text-muted-foreground">Clinical notes</p>
                </CardContent>
              </Card>

              {(() => {
                // Quick-scan severity tile. Counts whatever's in
                // medicalData with status critical / abnormal /
                // borderline (case-insensitive). Click → Labs tab so
                // the doctor can drill straight in.
                const critical = medicalData.filter(d => (d.status ?? '').toLowerCase() === 'critical').length;
                const abnormal = medicalData.filter(d => {
                  const s = (d.status ?? '').toLowerCase();
                  return s === 'abnormal' || s === 'high' || s === 'low';
                }).length;
                const borderline = medicalData.filter(d => (d.status ?? '').toLowerCase() === 'borderline').length;
                const flagged = critical + abnormal;
                return (
                  <Card
                    className={`cursor-pointer hover:shadow-md transition-shadow ${critical > 0 ? 'border-red-500/40 bg-red-50/40 dark:bg-red-900/10' : abnormal > 0 ? 'border-amber-500/40 bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                    onClick={() => setActiveTab('labs')}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Flagged values</CardTitle>
                      <FileText className={`h-4 w-4 ${critical > 0 ? 'text-red-600' : abnormal > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{flagged}</div>
                      <p className="text-xs text-muted-foreground">
                        {flagged === 0
                          ? medicalData.length > 0 ? 'All in range' : 'No labs yet'
                          : `${critical} critical · ${abnormal} abnormal${borderline > 0 ? ` · ${borderline} borderline` : ''}`}
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>

            {/* Tracking summary — last period, cycle stats, top
                symptoms (last 30d), hot-flash count for menopause.
                Same aggregations the patient sees on her dashboard /
                print view. Self-hides each block when data is empty. */}
            <DoctorPatientTrackingSummary
              periodRecords={periodRecords}
              signals={healthSignals}
              lifeStage={patient?.life_stage ?? null}
            />

            {/* Recent Appointments */}
            <Card>
              <CardHeader>
                <CardTitle>Appointment History</CardTitle>
              </CardHeader>
              <CardContent>
                {appointments.length > 0 ? (
                  <div className="space-y-4">
                    {appointments.slice(0, 5).map((apt) => (
                      <div key={apt.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 p-2 rounded-full">
                            <Calendar className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {new Date(apt.scheduled_at).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {apt.consultation_type || 'Consultation'} • {apt.status}
                            </p>
                          </div>
                        </div>
                        {apt.notes && (
                          <p className="text-sm text-muted-foreground max-w-xs truncate">{apt.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No appointment history</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Health Data Tab */}
          <TabsContent value="health" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Health Signals</CardTitle>
                <CardDescription>Daily tracking data from the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                {healthSignals.length > 0 ? (
                  <div className="space-y-4">
                    {healthSignals.map((signal) => (
                      <div key={signal.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-medium">
                            {new Date(signal.signal_date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                          {signal.symptoms && signal.symptoms.length > 0 && (
                            <div>
                              <p className="text-muted-foreground mb-1 flex items-center gap-1">
                                <Heart className="h-3 w-3" /> Symptoms
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {signal.symptoms.map((s, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {signal.mood && signal.mood.length > 0 && (
                            <div>
                              <p className="text-muted-foreground mb-1 flex items-center gap-1">
                                <Activity className="h-3 w-3" /> Mood
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {signal.mood.map((m, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">{m}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {signal.discharge && (
                            <div>
                              <p className="text-muted-foreground mb-1 flex items-center gap-1">
                                <Droplet className="h-3 w-3" /> Discharge
                              </p>
                              <Badge variant="outline" className="text-xs">{signal.discharge}</Badge>
                            </div>
                          )}
                        </div>
                        {signal.notes && (
                          <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{signal.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No health data recorded</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Lab Results Tab */}
          <TabsContent value="labs" className="space-y-6">
            <LabResultsView medicalData={medicalData} documents={documents} periodRecords={periodRecords} />
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Health Documents</CardTitle>
                <CardDescription>Medical documents uploaded by the patient</CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length > 5 && (() => {
                  const categories = Array.from(
                    new Set(
                      documents
                        .map(d => d.document_type)
                        .filter((s): s is string => Boolean(s))
                    )
                  ).sort();
                  return (
                    <div className="mb-4 flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="Search file or summary…"
                        value={docsQuery}
                        onChange={e => setDocsQuery(e.target.value)}
                        className="flex-1"
                      />
                      <Select value={docsCategoryFilter} onValueChange={setDocsCategoryFilter}>
                        <SelectTrigger className="sm:w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All categories</SelectItem>
                          {categories.map(c => (
                            <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
                {(() => {
                  const q = docsQuery.trim().toLowerCase();
                  const visibleDocs = documents.filter(d => {
                    if (docsCategoryFilter !== 'all' && d.document_type !== docsCategoryFilter) return false;
                    if (!q) return true;
                    return (d.file_name || '').toLowerCase().includes(q)
                      || (d.ai_suggested_name || '').toLowerCase().includes(q)
                      || (d.ai_summary || '').toLowerCase().includes(q);
                  });
                  if (documents.length === 0) {
                    return <p className="text-muted-foreground text-center py-8">No documents uploaded</p>;
                  }
                  if (visibleDocs.length === 0) {
                    return <p className="text-muted-foreground text-center py-8 text-sm">No documents match this filter.</p>;
                  }
                  return (
                  <div className="space-y-4">
                    {visibleDocs.map((doc) => (
                      <div key={doc.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="bg-muted p-2 rounded">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{doc.ai_suggested_name || doc.file_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {doc.document_type} • {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'Unknown date'}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // health_documents.file_path is a Vercel Blob URL
                              // (see /api/me/export.ts notes). Opens directly —
                              // the old Supabase createSignedUrl path was dead
                              // code post-migration and silently failed.
                              if (!doc.file_path) {
                                toast({ variant: 'destructive', title: 'Error', description: 'No file URL on this document.' });
                                return;
                              }
                              window.open(doc.file_path, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        </div>
                        {doc.ai_summary && (
                          <div className="mt-3 pt-3 border-t prose prose-sm max-w-none dark:prose-invert text-sm">
                            <ReactMarkdown>{doc.ai_summary}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="space-y-6">
            {/* Add Note Form */}
            {showNoteForm && (
              <Card>
                <CardHeader>
                  <CardTitle>Add Clinical Note</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      value={newNote.title}
                      onChange={(e) => setNewNote(n => ({ ...n, title: e.target.value }))}
                      placeholder="Note title"
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Type</label>
                      <Select 
                        value={newNote.note_type} 
                        onValueChange={(value) => setNewNote(n => ({ ...n, note_type: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="observation">Observation</SelectItem>
                          <SelectItem value="diagnosis">Diagnosis</SelectItem>
                          <SelectItem value="recommendation">Recommendation</SelectItem>
                          <SelectItem value="follow_up">Follow-up</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Visibility</label>
                      <Select 
                        value={newNote.is_visible_to_patient ? 'visible' : 'hidden'}
                        onValueChange={(value) => setNewNote(n => ({ ...n, is_visible_to_patient: value === 'visible' }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="visible">Visible to patient</SelectItem>
                          <SelectItem value="hidden">Doctor only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Content</label>
                    <Textarea
                      value={newNote.content}
                      onChange={(e) => setNewNote(n => ({ ...n, content: e.target.value }))}
                      placeholder="Enter your clinical notes..."
                      rows={5}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddNote}
                      className="bg-secondary hover:bg-secondary/90"
                      disabled={!newNote.title || !newNote.content || isSavingNote}
                    >
                      {isSavingNote ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Note'
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => setShowNoteForm(false)} disabled={isSavingNote}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes List */}
            <Card>
              <CardHeader>
                <CardTitle>Clinical Notes</CardTitle>
                <CardDescription>Your notes for this patient</CardDescription>
              </CardHeader>
              <CardContent>
                {doctorNotes.length > 5 && (
                  <div className="mb-4 flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="Search note title or content…"
                      value={notesQuery}
                      onChange={e => setNotesQuery(e.target.value)}
                      className="flex-1"
                    />
                    <Select value={notesTypeFilter} onValueChange={setNotesTypeFilter}>
                      <SelectTrigger className="sm:w-44"><SelectValue placeholder="All types" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="observation">Observation</SelectItem>
                        <SelectItem value="diagnosis">Diagnosis</SelectItem>
                        <SelectItem value="recommendation">Recommendation</SelectItem>
                        <SelectItem value="follow_up">Follow-up</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(() => {
                  const q = notesQuery.trim().toLowerCase();
                  const visibleNotes = doctorNotes.filter(n => {
                    if (notesTypeFilter !== 'all' && (n.note_type ?? '') !== notesTypeFilter) return false;
                    if (!q) return true;
                    return (n.title || '').toLowerCase().includes(q)
                      || (n.content || '').toLowerCase().includes(q);
                  });
                  if (doctorNotes.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-4">No notes added yet</p>
                        <Button onClick={() => setShowNoteForm(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add First Note
                        </Button>
                      </div>
                    );
                  }
                  if (visibleNotes.length === 0) {
                    return (
                      <p className="text-muted-foreground text-center py-8 text-sm">
                        No notes match this filter.
                      </p>
                    );
                  }
                  return (
                  <div className="space-y-4">
                    {visibleNotes.map((note) => editingNoteId === note.id ? (
                      <div key={note.id} className="border rounded-lg p-4 bg-muted/30 space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Title</label>
                          <Input
                            value={editingNote.title}
                            onChange={(e) => setEditingNote(n => ({ ...n, title: e.target.value }))}
                          />
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Type</label>
                            <Select
                              value={editingNote.note_type}
                              onValueChange={(value) => setEditingNote(n => ({ ...n, note_type: value }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="observation">Observation</SelectItem>
                                <SelectItem value="diagnosis">Diagnosis</SelectItem>
                                <SelectItem value="recommendation">Recommendation</SelectItem>
                                <SelectItem value="follow_up">Follow-up</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Visibility</label>
                            <Select
                              value={editingNote.is_visible_to_patient ? 'visible' : 'hidden'}
                              onValueChange={(value) => setEditingNote(n => ({ ...n, is_visible_to_patient: value === 'visible' }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="visible">Visible to patient</SelectItem>
                                <SelectItem value="hidden">Doctor only</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Content</label>
                          <Textarea
                            value={editingNote.content}
                            onChange={(e) => setEditingNote(n => ({ ...n, content: e.target.value }))}
                            rows={5}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={handleUpdateNote}
                            size="sm"
                            disabled={!editingNote.title || !editingNote.content || isUpdatingNote}
                          >
                            {isUpdatingNote ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                            ) : 'Save changes'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={cancelEditingNote} disabled={isUpdatingNote}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div key={note.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2 gap-3">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-medium">{note.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              {new Date(note.created_at).toLocaleDateString()} • {note.note_type}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Badge variant={note.is_visible_to_patient ? 'default' : 'outline'}>
                              {note.is_visible_to_patient ? 'Visible' : 'Private'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => startEditingNote(note)}
                              disabled={deletingNoteId === note.id}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteNote(note.id)}
                              disabled={deletingNoteId === note.id}
                            >
                              {deletingNoteId === note.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : 'Delete'}
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                  </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PatientDetails;

// Severity ranking for sorting. Lower number = more urgent, surface
// first. "abnormal" and "high" / "low" share a tier because not every
// LLM extraction normalizes to a single set of strings.
function statusRank(status: string | null): number {
  const s = (status || '').toLowerCase();
  if (s === 'critical') return 0;
  if (s === 'high' || s === 'low' || s === 'abnormal') return 1;
  if (s === 'borderline' || s === 'informational') return 2;
  return 3; // normal / unknown
}

function statusBadgeClass(status: string | null): string {
  const s = (status || '').toLowerCase();
  if (s === 'critical') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
  if (s === 'high' || s === 'low' || s === 'abnormal') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
  if (s === 'borderline') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200';
  if (s === 'normal') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200';
  return 'bg-muted text-muted-foreground';
}

function formatValue(v: string | number | null, unit: string | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const base = typeof v === 'number' ? String(v) : v;
  return unit ? `${base} ${unit}` : base;
}

const LabResultsView = ({
  medicalData,
  documents,
  periodRecords,
}: {
  medicalData: MedicalDataRow[];
  documents: HealthDocument[];
  periodRecords: Array<{ period_start_date: string; cycle_length: number }>;
}) => {
  const [query, setQuery] = useState('');
  const docNameById = new Map(documents.map(d => [d.id, d.ai_suggested_name || d.file_name]));

  // Same phase-mapping the patient sees on PanelDetail (commit 1d8cd86).
  // Doctor scanning a follicular-phase FSH 4 now sees "day 5 ·
  // follicular" alongside the value instead of having to mentally
  // overlay the patient's cycle on the lab dates.
  const cyclePhaseForDate = (dateRecorded: string | null): { cycleDay: number; phase: 'follicular' | 'midcycle' | 'luteal' } | null => {
    if (!dateRecorded || periodRecords.length === 0) return null;
    const draw = new Date(dateRecorded);
    if (Number.isNaN(draw.getTime())) return null;
    let cycleStart: Date | null = null;
    let cycleLen = 28;
    for (let i = periodRecords.length - 1; i >= 0; i--) {
      const ps = new Date(periodRecords[i].period_start_date);
      if (Number.isNaN(ps.getTime())) continue;
      if (ps.getTime() <= draw.getTime()) {
        cycleStart = ps;
        cycleLen = periodRecords[i].cycle_length || 28;
        if (i + 1 < periodRecords.length) {
          const next = new Date(periodRecords[i + 1].period_start_date);
          if (!Number.isNaN(next.getTime()) && next.getTime() <= draw.getTime()) continue;
        }
        break;
      }
    }
    if (!cycleStart) return null;
    const days = Math.floor((draw.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24));
    const cycleDay = days + 1;
    if (cycleDay < 1 || cycleDay > cycleLen + 7) return null;
    const ovulation = cycleLen - 14;
    let phase: 'follicular' | 'midcycle' | 'luteal';
    if (Math.abs(cycleDay - ovulation) <= 2) phase = 'midcycle';
    else if (cycleDay < ovulation) phase = 'follicular';
    else phase = 'luteal';
    return { cycleDay, phase };
  };

  // Identify cycle-hormone rows by title to keep the chip out of CBC,
  // lipids, etc. Same regex as hormone-reference.ts but inlined to
  // avoid pulling that module into the doctor page.
  const isCycleHormone = (title: string): boolean => /^fsh$|^lh$|^estradiol$|^e2$|^progesterone$/i.test(title.trim());

  const filtered = medicalData.filter(r => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (r.title || '').toLowerCase().includes(q) || (r.notes || '').toLowerCase().includes(q);
  });

  const flagged = filtered
    .filter(r => statusRank(r.status) <= 1)
    .sort((a, b) => {
      const r = statusRank(a.status) - statusRank(b.status);
      if (r !== 0) return r;
      const ad = a.date_recorded ? new Date(a.date_recorded).getTime() : 0;
      const bd = b.date_recorded ? new Date(b.date_recorded).getTime() : 0;
      return bd - ad;
    });

  const allRecent = [...filtered].sort((a, b) => {
    const ad = a.date_recorded ? new Date(a.date_recorded).getTime() : 0;
    const bd = b.date_recorded ? new Date(b.date_recorded).getTime() : 0;
    return bd - ad;
  });

  if (medicalData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lab Results</CardTitle>
          <CardDescription>Values extracted from the patient's uploaded documents</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No lab values extracted yet. They'll appear here once the patient's documents have been analyzed.
          </p>
        </CardContent>
      </Card>
    );
  }

  const Row = ({ r }: { r: MedicalDataRow }) => {
    const phaseInfo = isCycleHormone(r.title) ? cyclePhaseForDate(r.date_recorded) : null;
    return (
    <div className="flex items-start gap-3 border rounded-lg p-3 bg-card">
      <Badge className={`text-[10px] capitalize shrink-0 ${statusBadgeClass(r.status)}`} variant="outline">
        {r.status || 'unknown'}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{r.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs">
          <span className="font-mono">{formatValue(r.value, r.unit)}</span>
          {phaseInfo && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              day {phaseInfo.cycleDay} · {phaseInfo.phase}
            </span>
          )}
          {r.reference_range && (
            <span className="text-muted-foreground">ref {r.reference_range}</span>
          )}
          {r.date_recorded && (
            <span className="text-muted-foreground">{new Date(r.date_recorded).toLocaleDateString()}</span>
          )}
          {docNameById.has(r.document_id) && (
            <span className="text-muted-foreground truncate">· {docNameById.get(r.document_id)}</span>
          )}
        </div>
        {r.notes && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{r.notes}</p>
        )}
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-6">
      <Input
        placeholder="Search by test name or notes…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="max-w-md"
      />

      <Card>
        <CardHeader>
          <CardTitle>Flagged Values</CardTitle>
          <CardDescription>
            {flagged.length === 0
              ? 'No abnormal results in the extracted data.'
              : `${flagged.length} result${flagged.length === 1 ? '' : 's'} outside the reference range, most urgent first.`}
          </CardDescription>
        </CardHeader>
        {flagged.length > 0 && (
          <CardContent className="space-y-2">
            {flagged.map(r => <Row key={r.id} r={r} />)}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By Panel</CardTitle>
          <CardDescription>
            Results grouped by panel (CBC, Thyroid, etc) — most-populated first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const groups = new Map<string, MedicalDataRow[]>();
            for (const r of allRecent) {
              const panel = r.raw_data?.panel?.trim() || 'Other';
              const arr = groups.get(panel) ?? [];
              arr.push(r);
              groups.set(panel, arr);
            }
            const sortedGroups = [...groups.entries()].sort((a, b) => {
              if (a[0] === 'Other') return 1;
              if (b[0] === 'Other') return -1;
              return b[1].length - a[1].length;
            });
            if (sortedGroups.length === 0) {
              return <p className="text-muted-foreground text-center py-8">No results match the filter.</p>;
            }
            return sortedGroups.map(([panel, items]) => (
              <div key={panel}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  {panel} · {items.length}
                </p>
                <div className="space-y-2">
                  {items.slice(0, 30).map(r => <Row key={r.id} r={r} />)}
                  {items.length > 30 && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      +{items.length - 30} more in {panel}. Use search to narrow.
                    </p>
                  )}
                </div>
              </div>
            ));
          })()}
        </CardContent>
      </Card>
    </div>
  );
};
