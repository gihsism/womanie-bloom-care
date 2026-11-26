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
import { useClinicTheme } from '@/hooks/useClinicTheme';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowRightLeft, LogOut, Menu, UserPlus } from 'lucide-react';
import DoctorTodayList from '@/components/doctor/DoctorTodayList';
import DoctorDaySchedule from '@/components/doctor/DoctorDaySchedule';
import DoctorPatientList from '@/components/doctor/DoctorPatientList';
import AddPatientForm from '@/components/doctor/AddPatientForm';
import DoctorAppointments from '@/components/doctor/DoctorAppointments';
import DoctorProfileEditor from '@/components/doctor/DoctorProfileEditor';
import ConsultationSettings from '@/components/doctor/ConsultationSettings';
import DoctorSetupChecklist from '@/components/doctor/DoctorSetupChecklist';
import BookingAlerts from '@/components/doctor/BookingAlerts';
import { computeSetupSteps, type SetupScheduleRow, type SetupSettings } from '@/lib/doctorSetup';
import type { DoctorAppointment, DoctorPatientConnection } from '@/lib/doctorDashboard';

// Doctor home. Above the fold: name, "Your day" (today's and tomorrow's
// visits), "Needs you" (max 3 rows of things to close or notice), ONE primary action ("Add a patient") and the patient list
// with search. Appointments and Profile & settings sit behind tabs; log
// out and patient view sit in the Menu.
//
// Idea 4: the same page scale as the patient side (page title, section
// titles, hairline row groups, one accent button) in the neutral
// "clinic" colours, since doctors are not in a life stage.

interface DoctorProfile {
  id: string;
  full_name: string;
  specialty: string | null;
  is_verified: boolean;
  verification_status: string | null;
  avatar_url?: string | null;
  specialties?: string[] | null;
  languages?: string[] | null;
  practice_address?: string | null;
}

type View = 'home' | 'appointments' | 'settings';

const DoctorDashboard = () => {
  const navigate = useNavigate();
  usePageTitle('Doctor Portal');
  useClinicTheme();
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
  const [setupSettings, setSetupSettings] = useState<SetupSettings | null>(null);
  const [setupSchedule, setSetupSchedule] = useState<SetupScheduleRow[]>([]);

  // The setup checklist's own rows (owner-scoped through /api/db). Reloaded
  // whenever the doctor comes back to Home, so a step she just finished in
  // Profile & settings ticks off without a page reload.
  const loadSetup = useCallback(async () => {
    if (!user) return;
    try {
      const [{ data: profile }, { data: cs }, { data: sched }] = await Promise.all([
        db.from('doctor_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        db.from('consultation_settings').select('*').eq('doctor_id', user.id).maybeSingle(),
        db.from('doctor_schedule').select('*').eq('doctor_id', user.id),
      ]);
      if (profile) setDoctorProfile(profile);
      setSetupSettings((cs as SetupSettings | null) ?? null);
      setSetupSchedule((sched as SetupScheduleRow[] | null) ?? []);
    } catch (error) {
      console.error('Error loading setup state:', error);
    }
  }, [user]);

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

  useEffect(() => {
    if (view === 'home') void loadSetup();
  }, [view, loadSetup]);

  // A checklist step: open Profile & settings and bring that setting into view.
  const goToSetting = useCallback((anchor: string) => {
    setView('settings');
    let tries = 0;
    const tick = () => {
      const el = document.getElementById(anchor);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = el.matches('input,button,textarea,select,[role="switch"]')
          ? el
          : el.querySelector<HTMLElement>('input,button,textarea,select,[role="switch"]');
        (focusable as HTMLElement | null)?.focus({ preventScroll: true });
      } else if (tries++ < 20) {
        // The settings cards load their rows first; wait for them.
        setTimeout(tick, 100);
      }
    };
    setTimeout(tick, 50);
  }, []);

  if (loading || !hasLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <div className="page-head px-4 py-4">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-40 rounded-[1.25rem]" />
          <Skeleton className="h-[3.25rem] rounded-full" />
          <Skeleton className="h-48 rounded-[1.25rem]" />
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
      <div className="page-head sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="page-title truncate">{doctorProfile?.full_name || 'Doctor'}</h1>
            {doctorProfile?.specialty && (
              <p className="page-sub truncate">{doctorProfile.specialty}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 shrink-0 h-10 px-4 border-line text-[15px] font-semibold">
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

      <div className="px-4 py-5 max-w-3xl mx-auto">
        {verification && (
          <div
            role="status"
            className={`mb-5 rounded-[1.25rem] border px-4 py-3 text-[15px] flex items-start gap-2.5 ${
              verification.tone === 'bad'
                ? 'bg-destructive/5 border-destructive/25 text-destructive'
                : 'bg-stage-tint border-line text-foreground'
            }`}
          >
            <AlertCircle
              className={`h-5 w-5 shrink-0 mt-px ${verification.tone === 'bad' ? '' : 'text-stage-accent'}`}
              aria-hidden="true"
            />
            <p>{verification.text}</p>
          </div>
        )}

        <Tabs value={view} onValueChange={v => setView(v as View)} className="space-y-6">
          <TabsList className="flex w-full gap-6 h-11">
            <TabsTrigger value="home" className="text-[15px]">Home</TabsTrigger>
            <TabsTrigger value="appointments" className="text-[15px]">Appointments</TabsTrigger>
            <TabsTrigger value="settings" className="text-[15px]">Profile & settings</TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="space-y-7">
            <DoctorSetupChecklist
              steps={computeSetupSteps(doctorProfile, setupSettings, setupSchedule)}
              onGo={goToSetting}
            />

            <DoctorDaySchedule appointments={appointments} patients={patients} />

            <DoctorTodayList
              appointments={appointments}
              patients={patients}
              onOpenAppointments={() => setView('appointments')}
            />

            {addingPatient ? (
              <AddPatientForm onAdded={loadDoctorData} onClose={() => setAddingPatient(false)} />
            ) : (
              <button type="button" className="btn-stage w-full" onClick={() => setAddingPatient(true)}>
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                Add a patient
              </button>
            )}

            <DoctorPatientList patients={patients} />
          </TabsContent>

          <TabsContent value="appointments">
            <DoctorAppointments appointments={appointments} patients={patients} onChange={loadDoctorData} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <DoctorProfileEditor doctorId={user.id} />
            <ConsultationSettings doctorId={user.id} />
            <BookingAlerts />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DoctorDashboard;
