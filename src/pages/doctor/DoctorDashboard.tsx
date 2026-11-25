import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireRole } from '@/hooks/useRequireRole';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowRightLeft, LogOut, Menu, UserPlus } from 'lucide-react';
import DoctorTodayList from '@/components/doctor/DoctorTodayList';
import DoctorDaySchedule from '@/components/doctor/DoctorDaySchedule';
import DoctorPatientList from '@/components/doctor/DoctorPatientList';
import AddPatientForm from '@/components/doctor/AddPatientForm';
import DoctorAppointments from '@/components/doctor/DoctorAppointments';
import DoctorProfileEditor from '@/components/doctor/DoctorProfileEditor';
import ConsultationSettings from '@/components/doctor/ConsultationSettings';
import type { DoctorAppointment, DoctorPatientConnection } from '@/lib/doctorDashboard';

// Doctor home. Above the fold: name, "Your day" (today's and tomorrow's
// visits), "Needs you" (max 3 rows of things to close or notice), ONE primary action ("Add a patient") and the patient list
// with search. Appointments and Profile & settings sit behind tabs; log
// out and patient view sit in the Menu.

interface DoctorProfile {
  id: string;
  full_name: string;
  specialty: string | null;
  is_verified: boolean;
  verification_status: string | null;
}

type View = 'home' | 'appointments' | 'settings';

const DoctorDashboard = () => {
  const navigate = useNavigate();
  usePageTitle('Doctor Portal');
  const { loading } = useRequireRole('doctor', '/auth/doctor-login');
  const { user } = useAuth();
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [patients, setPatients] = useState<DoctorPatientConnection[]>([]);
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  // Skeleton only on the first load; refreshes after an action keep the
  // page (and the open tab's state) in place instead of flashing.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [view, setView] = useState<View>('home');
  const [addingPatient, setAddingPatient] = useState(false);

  const loadDoctorData = useCallback(async () => {
    if (!user) return;
    try {
      const { data: profile } = await db
        .from('doctor_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      setDoctorProfile(profile);

      // Consent-gated endpoint: joins the patient's name, and her life
      // stage + upload activity only for APPROVED connections.
      try {
        const resp = await fetch('/api/doctors/connections', { credentials: 'include' });
        if (resp.ok) {
          const { connections } = (await resp.json()) as { connections: DoctorPatientConnection[] };
          setPatients(connections || []);
        } else {
          // Unjoined fallback so the list still renders; names degrade
          // to "Patient #...".
          const { data: connections } = await db
            .from('doctor_patient_connections')
            .select('*')
            .eq('doctor_id', user.id)
            .order('created_at', { ascending: false });
          setPatients(connections || []);
        }
      } catch {
        setPatients([]);
      }

      const { data: appts } = await db
        .from('appointments')
        .select('*')
        .eq('doctor_id', user.id)
        .order('scheduled_at', { ascending: true });
      setAppointments(appts || []);
    } catch (error) {
      console.error('Error loading doctor data:', error);
    } finally {
      setHasLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    loadDoctorData();
  }, [loadDoctorData]);

  if (loading || !hasLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card p-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const status = doctorProfile?.verification_status;
  const verification =
    status === 'approved'
      ? null
      : status === 'rejected'
      ? { tone: 'bad', text: 'Your licence was not verified. Email support@womanie.info with updated details.' }
      : status === 'revoked'
      ? { tone: 'bad', text: 'Your verification was revoked, so patients cannot find you. Email support@womanie.info.' }
      : { tone: 'wait', text: 'We are checking your licence (1–3 working days). Patients can find you once it is approved and "Accept new bookings" is on in Profile & settings.' };

  return (
    <div className="min-h-screen bg-background">
      {/* Header: who you are + one Menu. No logo link out of the app. */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{doctorProfile?.full_name || 'Doctor'}</h1>
            {doctorProfile?.specialty && (
              <p className="text-sm text-muted-foreground truncate">{doctorProfile.specialty}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 shrink-0">
                <Menu className="h-4 w-4" aria-hidden="true" />
                Menu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => navigate('/dashboard')}>
                <ArrowRightLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                Switch to patient view
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { window.location.href = '/api/auth/logout'; }}>
                <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {verification && (
        <div
          role="status"
          className={`border-b px-4 py-2 ${
            verification.tone === 'bad'
              ? 'bg-destructive/10 border-destructive/30 text-destructive'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200'
          }`}
        >
          <p className="max-w-3xl mx-auto text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            {verification.text}
          </p>
        </div>
      )}

      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Tabs value={view} onValueChange={v => setView(v as View)} className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="home">Home</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="settings">Profile & settings</TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="space-y-6">
            <DoctorDaySchedule appointments={appointments} patients={patients} />

            <DoctorTodayList
              appointments={appointments}
              patients={patients}
              onOpenAppointments={() => setView('appointments')}
            />

            {addingPatient ? (
              <AddPatientForm onAdded={loadDoctorData} onClose={() => setAddingPatient(false)} />
            ) : (
              <Button
                size="lg"
                className="w-full gap-2 bg-secondary hover:bg-secondary/90"
                onClick={() => setAddingPatient(true)}
              >
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                Add a patient
              </Button>
            )}

            <DoctorPatientList patients={patients} />
          </TabsContent>

          <TabsContent value="appointments">
            <DoctorAppointments appointments={appointments} patients={patients} onChange={loadDoctorData} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <DoctorProfileEditor doctorId={user.id} />
            <ConsultationSettings doctorId={user.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DoctorDashboard;
