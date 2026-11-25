import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRequireRole } from '@/hooks/useRequireRole';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, PenLine } from 'lucide-react';
import { stageLabel } from '@/lib/doctorDashboard';
import { normalizePatientTab, pregnancyWeek, type PatientTab } from '@/lib/doctorPatient';
import PatientSummary from '@/components/doctor/patient/PatientSummary';
import PatientResults from '@/components/doctor/patient/PatientResults';
import PatientDocuments from '@/components/doctor/patient/PatientDocuments';
import PatientNotes from '@/components/doctor/patient/PatientNotes';
import PatientVisits from '@/components/doctor/patient/PatientVisits';
import {
  EMPTY_DRAFT,
  type NoteDraft,
  type DoctorNote,
  type HealthDocument,
  type HealthSignal,
  type MedicalDataRow,
  type PatientAppointment,
  type PatientProfile,
  type PeriodRecord,
  type PatientVisitQuestions,
} from '@/components/doctor/patient/types';

// The doctor's view of one patient. Header: who she is and where she is
// (stage, pregnancy week, IVF phase) + ONE primary action, "Write a note".
// Below: tabs Summary · Results · Documents · Notes · Visits.
//
// All data comes from the consent-gated /api/doctors/patient, which 403s
// unless this doctor has an APPROVED connection and logs every fetch to
// chart_access_log for the patient to review.

// Stable empty list: a fresh [] on every chart load would re-render forever
// when the auth user object is recreated (see PatientDetails.test).
const NO_VISIT_QUESTIONS: PatientVisitQuestions[] = [];

const PatientDetails = () => {
  const navigate = useNavigate();
  usePageTitle('Patient');
  const { patientId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { loading } = useRequireRole('doctor', '/auth/doctor-login');
  const { user } = useAuth();

  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [healthSignals, setHealthSignals] = useState<HealthSignal[]>([]);
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  const [doctorNotes, setDoctorNotes] = useState<DoctorNote[]>([]);
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [medicalData, setMedicalData] = useState<MedicalDataRow[]>([]);
  const [periodRecords, setPeriodRecords] = useState<PeriodRecord[]>([]);
  const [visitQuestions, setVisitQuestions] = useState<PatientVisitQuestions[]>([]);
  // Skeleton only until the first answer; a refresh after saving a note
  // keeps the page in place.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [activeTab, setActiveTab] = useState<PatientTab>('summary');
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(EMPTY_DRAFT);

  // The primary action works from any tab (it used to open a form that
  // only existed inside the Notes tab, so from Overview it did nothing).
  const writeNote = (title?: string) => {
    if (title) setNoteDraft(d => ({ ...d, title, note_type: 'observation' }));
    setNoteFormOpen(true);
    setActiveTab('notes');
  };

  // Deep links: ?addNote=visit&date=YYYY-MM-DD (from "Add visit note"
  // after closing a visit) and ?tab=<name> (old names still accepted).
  useEffect(() => {
    const intent = searchParams.get('addNote');
    const tab = normalizePatientTab(searchParams.get('tab'));
    if (!intent && !searchParams.has('tab')) return;
    if (intent) {
      const d = new Date(searchParams.get('date') || '');
      const pretty = (isNaN(d.getTime()) ? new Date() : d).toLocaleDateString();
      writeNote(intent === 'visit' ? `Visit on ${pretty}` : undefined);
    } else if (tab) {
      setActiveTab(tab);
    }
    searchParams.delete('addNote');
    searchParams.delete('date');
    searchParams.delete('tab');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadChart = useCallback(async () => {
    if (!user || !patientId) return;
    try {
      const resp = await fetch(`/api/doctors/patient?id=${encodeURIComponent(patientId)}`);
      if (resp.status === 403) {
        setHasAccess(false);
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
      setVisitQuestions(Array.isArray(payload.visitQuestions) ? payload.visitQuestions : NO_VISIT_QUESTIONS);
    } catch (error) {
      console.error('Error loading patient data:', error);
      toast({ variant: 'destructive', title: 'Could not load this chart', description: 'Please try again.' });
    } finally {
      setHasLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, patientId]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  if (loading || !hasLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card p-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">
          You don't have access to this chart. The patient has to approve your request first.
        </p>
        <Button onClick={() => navigate('/doctor/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Back to patients
        </Button>
      </div>
    );
  }

  const preg = pregnancyWeek(patient?.pregnancy_due_date ?? null, Date.now());
  const facts = [
    stageLabel(patient?.life_stage) ?? 'Life stage not set',
    preg
      ? `Week ${preg.week} (${preg.daysToDue > 0 ? `${preg.daysToDue} days to due date` : preg.daysToDue === 0 ? 'due today' : `${-preg.daysToDue} days past due`})`
      : null,
    patient?.ivf_phase ? `IVF: ${patient.ivf_phase}` : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 px-2"
            onClick={() => navigate('/doctor/dashboard')}
            aria-label="Back to patients"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold truncate">{patient?.full_name || 'Patient'}</h1>
            <p className="text-sm text-muted-foreground truncate">{facts.join(' · ')}</p>
          </div>
          <Button onClick={() => writeNote()} size="sm" className="shrink-0 gap-1.5">
            <PenLine className="h-4 w-4" aria-hidden="true" />
            Write a note
          </Button>
        </div>
      </div>

      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as PatientTab)} className="space-y-4">
          <TabsList className="w-full grid grid-cols-5 h-auto">
            <TabsTrigger value="summary" className="text-xs sm:text-sm px-1">Summary</TabsTrigger>
            <TabsTrigger value="results" className="text-xs sm:text-sm px-1">Results</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs sm:text-sm px-1">Documents</TabsTrigger>
            <TabsTrigger value="notes" className="text-xs sm:text-sm px-1">Notes</TabsTrigger>
            <TabsTrigger value="visits" className="text-xs sm:text-sm px-1">Visits</TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <PatientSummary
              medicalData={medicalData}
              documents={documents}
              notes={doctorNotes}
              appointments={appointments}
              signals={healthSignals}
              periodRecords={periodRecords}
              lifeStage={patient?.life_stage ?? null}
              visitQuestions={visitQuestions}
              onOpenTab={setActiveTab}
            />
          </TabsContent>

          <TabsContent value="results">
            <PatientResults medicalData={medicalData} documents={documents} periodRecords={periodRecords} />
          </TabsContent>

          <TabsContent value="documents">
            <PatientDocuments documents={documents} />
          </TabsContent>

          <TabsContent value="notes">
            {user && patientId && (
              <PatientNotes
                doctorId={user.id}
                patientId={patientId}
                notes={doctorNotes}
                formOpen={noteFormOpen}
                draft={noteDraft}
                onDraftChange={setNoteDraft}
                onFormOpenChange={setNoteFormOpen}
                onChanged={loadChart}
              />
            )}
          </TabsContent>

          <TabsContent value="visits">
            <PatientVisits appointments={appointments} visitQuestions={visitQuestions} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PatientDetails;
