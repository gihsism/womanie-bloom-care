import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Bell, FileText, AlertTriangle, CalendarX, Search } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { onHealthDataChange } from '@/lib/data-events';
import PendingConnections from '@/components/dashboard/PendingConnections';
import ConnectedDoctors from '@/components/dashboard/ConnectedDoctors';
import DoctorNotesCard from '@/components/dashboard/DoctorNotesCard';
import { formatDistanceToNow } from 'date-fns';

// Notifications / "needs your attention" page.
//
// Currently reached from the PatientDashboard header dropdown and the
// AppSidebar. Before this page existed those links were 404-ing — the
// Notifications route was wired up to a non-existent component.
//
// Surfaces three kinds of attention-worthy items:
//   1. Doctors waiting for approval / already connected
//      (PendingConnections + ConnectedDoctors).
//   2. Documents stuck mid-analysis (uploaded_at older than 3 min with
//      no ai_summary) — same threshold MedicalHistory uses for its
//      "Analysis stalled · tap to retry" badge.
//   3. Recent critical findings — a one-click jump into the specific
//      doc via the deep-link we added in session 5.
//
// Everything is read-only; actions route back into existing flows
// (MedicalHistory re-analyze, doctor approve/revoke, etc.).

interface StalledDoc {
  id: string;
  file_name: string;
  ai_suggested_name: string | null;
  uploaded_at: string | null;
}

interface CriticalFinding {
  id: string;
  document_id: string | null;
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
  date_recorded: string | null;
}

interface CancelledAppt {
  id: string;
  scheduled_at: string;
  status: string | null;
  notes: string | null;
  doctor_name: string | null;
  doctor_title: string | null;
}

function doctorCancelReason(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/^Cancelled by doctor:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

const CANCEL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export default function Notifications() {
  usePageTitle('Notifications');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stalled, setStalled] = useState<StalledDoc[]>([]);
  const [critical, setCritical] = useState<CriticalFinding[]>([]);
  const [cancellations, setCancellations] = useState<CancelledAppt[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [docsRes, findingsRes, apptsResp] = await Promise.all([
        db.from('health_documents')
          .select('id, file_name, ai_suggested_name, ai_summary, uploaded_at')
          .eq('user_id', user.id)
          .order('uploaded_at', { ascending: false }),
        db.from('current_extracted_data')
          .select('id, document_id, title, value, unit, status, date_recorded')
          .eq('user_id', user.id)
          .eq('status', 'critical'),
        fetch('/api/me/appointments')
          .then(r => (r.ok ? r.json() : { appointments: [] }))
          .catch(() => ({ appointments: [] })),
      ]);
      const docs = (docsRes.data ?? []) as Array<{ id: string; file_name: string; ai_suggested_name: string | null; ai_summary: string | null; uploaded_at: string | null }>;
      const threeMinAgo = Date.now() - 3 * 60 * 1000;
      setStalled(
        docs
          .filter(d => !d.ai_summary && d.uploaded_at && Date.parse(d.uploaded_at) < threeMinAgo)
          .slice(0, 10),
      );
      setCritical((findingsRes.data ?? []) as CriticalFinding[]);

      // Doctor-initiated cancellations in the last 14 days. Patient-
      // initiated cancellations don't carry the "Cancelled by doctor:"
      // prefix, so they're correctly omitted (the patient already knows
      // about their own cancellations — no need to surface them here).
      const cancelCutoff = Date.now() - CANCEL_WINDOW_MS;
      const appts = (apptsResp?.appointments ?? []) as CancelledAppt[];
      setCancellations(
        appts
          .filter(a =>
            (a.status ?? '').toLowerCase() === 'cancelled' &&
            doctorCancelReason(a.notes) !== null &&
            Date.parse(a.scheduled_at) >= cancelCutoff
          )
          .slice(0, 10)
      );
    };
    load();
    return onHealthDataChange(load);
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h1 className="text-base font-bold">Notifications</h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        <PendingConnections />

        <DoctorNotesCard />

        {stalled.length > 0 && (
          <Card className="p-4 border-l-4 border-l-destructive">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-destructive" />
              <p className="text-sm font-semibold">
                {stalled.length === 1 ? '1 analysis appears stalled' : `${stalled.length} analyses appear stalled`}
              </p>
            </div>
            <ul className="space-y-1.5">
              {stalled.map(d => {
                const age = d.uploaded_at
                  ? formatDistanceToNow(new Date(d.uploaded_at), { addSuffix: true })
                  : '';
                return (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      <span className="font-medium">{d.ai_suggested_name || d.file_name}</span>
                      {age && <span className="text-muted-foreground"> · uploaded {age}</span>}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-shrink-0"
                      onClick={() => navigate(`/dashboard/medical-history?doc=${d.id}`)}
                    >
                      Open
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {critical.length > 0 && (
          <Card className="p-4 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-semibold">
                {critical.length === 1 ? '1 critical finding' : `${critical.length} critical findings`}
              </p>
            </div>
            <ul className="space-y-1.5">
              {critical.slice(0, 8).map(f => (
                <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">
                    <span className="font-medium">{f.title}</span>
                    {f.value && (
                      <span className="text-muted-foreground">
                        {' '}— {f.value}{f.unit ? ` ${f.unit}` : ''}
                      </span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs flex-shrink-0"
                    onClick={() => navigate(f.document_id ? `/dashboard/medical-history?doc=${f.document_id}` : '/dashboard/medical-history')}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {cancellations.length > 0 && (
          <Card className="p-4 border-l-4 border-l-destructive">
            <div className="flex items-center gap-2 mb-3">
              <CalendarX className="h-4 w-4 text-destructive" />
              <p className="text-sm font-semibold">
                {cancellations.length === 1
                  ? 'A doctor cancelled your appointment'
                  : `${cancellations.length} appointments were cancelled by your doctor`}
              </p>
            </div>
            <ul className="space-y-2">
              {cancellations.map(apt => {
                const when = new Date(apt.scheduled_at);
                const reason = doctorCancelReason(apt.notes);
                const doctor = [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || 'Your doctor';
                return (
                  <li key={apt.id} className="text-xs space-y-0.5 border-l-2 border-destructive/40 pl-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{doctor}</span>
                        <span className="text-muted-foreground"> · {when.toLocaleDateString()} at {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-shrink-0 gap-1"
                        onClick={() => navigate('/find-doctor')}
                      >
                        <Search className="h-3 w-3" />
                        Rebook
                      </Button>
                    </div>
                    {reason && (
                      <p className="text-muted-foreground italic">"{reason}"</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <ConnectedDoctors />

        {/* Empty-state when there's genuinely nothing. */}
        <div className="text-center text-sm text-muted-foreground py-8">
          Nothing else to flag right now.
        </div>
      </div>
    </div>
  );
}
