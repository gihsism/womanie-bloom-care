import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft,
  User,
  FileText,
  Calendar,
  Activity,
  Plus,
  Clock,
  Heart,
  Droplet,
  MessageSquare,
  Download,
  Eye,
} from 'lucide-react';

interface PatientProfile {
  id: string;
  full_name: string | null;
  life_stage: string | null;
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
  document_type: string;
  ai_summary: string | null;
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

const PatientDetails = () => {
  const navigate = useNavigate();
  const { patientId } = useParams();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [healthSignals, setHealthSignals] = useState<HealthSignal[]>([]);
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  const [doctorNotes, setDoctorNotes] = useState<DoctorNote[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  
  // New note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [newNote, setNewNote] = useState({
    title: '',
    content: '',
    note_type: 'observation',
    is_visible_to_patient: true,
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth/doctor-login');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user && patientId) {
      checkAccessAndLoadData();
    }
  }, [user, patientId]);

  const checkAccessAndLoadData = async () => {
    if (!user || !patientId) return;
    setIsLoadingData(true);

    try {
      // Check if doctor has approved access to this patient
      const { data: connection } = await supabase
        .from('doctor_patient_connections')
        .select('*')
        .eq('doctor_id', user.id)
        .eq('patient_id', patientId)
        .eq('status', 'approved')
        .maybeSingle();

      if (!connection) {
        setHasAccess(false);
        toast({
          variant: 'destructive',
          title: 'Access denied',
          description: 'You do not have permission to view this patient\'s data.',
        });
        return;
      }

      setHasAccess(true);

      // Load patient profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', patientId)
        .maybeSingle();

      setPatient(profileData);

      // Load health signals (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: signalsData } = await supabase
        .from('daily_health_signals')
        .select('*')
        .eq('user_id', patientId)
        .gte('signal_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('signal_date', { ascending: false });

      setHealthSignals(signalsData || []);

      // Load documents
      const { data: docsData } = await supabase
        .from('health_documents')
        .select('*')
        .eq('user_id', patientId)
        .order('uploaded_at', { ascending: false });

      setDocuments(docsData || []);

      // Load doctor's notes for this patient
      const { data: notesData } = await supabase
        .from('doctor_notes')
        .select('*')
        .eq('doctor_id', user.id)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      setDoctorNotes(notesData || []);

      // Load appointments
      const { data: appointmentsData } = await supabase
        .from('appointments')
        .select('*')
        .eq('doctor_id', user.id)
        .eq('patient_id', patientId)
        .order('scheduled_at', { ascending: false });

      setAppointments(appointmentsData || []);

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

    try {
      const { error } = await supabase
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
    }
  };

  if (loading || isLoadingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
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
                Life stage: {patient?.life_stage || 'Not specified'}
              </p>
            </div>
            <Button onClick={() => setShowNoteForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-4 lg:w-[500px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="health">Health Data</TabsTrigger>
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
                  <p className="text-xs text-muted-foreground">Uploaded files</p>
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
            </div>

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

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Health Documents</CardTitle>
                <CardDescription>Medical documents uploaded by the patient</CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length > 0 ? (
                  <div className="space-y-4">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-start justify-between border rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <div className="bg-muted p-2 rounded">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{doc.file_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {doc.document_type} • {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'Unknown date'}
                            </p>
                            {doc.ai_summary && (
                              <p className="text-sm mt-2 text-muted-foreground">{doc.ai_summary}</p>
                            )}
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No documents uploaded</p>
                )}
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
                    <Button onClick={handleAddNote} className="bg-secondary hover:bg-secondary/90">
                      Save Note
                    </Button>
                    <Button variant="outline" onClick={() => setShowNoteForm(false)}>
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
                {doctorNotes.length > 0 ? (
                  <div className="space-y-4">
                    {doctorNotes.map((note) => (
                      <div key={note.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium">{note.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              {new Date(note.created_at).toLocaleDateString()} • {note.note_type}
                            </p>
                          </div>
                          <Badge variant={note.is_visible_to_patient ? 'default' : 'outline'}>
                            {note.is_visible_to_patient ? 'Visible' : 'Private'}
                          </Badge>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">No notes added yet</p>
                    <Button onClick={() => setShowNoteForm(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Note
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PatientDetails;
