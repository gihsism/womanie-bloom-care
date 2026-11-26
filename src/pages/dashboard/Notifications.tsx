import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SubPageHeader from '@/components/SubPageHeader';
import { ChevronRight } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { onHealthDataChange } from '@/lib/data-events';
import PendingConnections from '@/components/dashboard/PendingConnections';
import ConnectedDoctors from '@/components/dashboard/ConnectedDoctors';
import DoctorNotesCard from '@/components/dashboard/DoctorNotesCard';
import { formatDistanceToNow } from 'date-fns';
import { recentlyBooked, formatVisitWhen, visitTypeLabel } from '@/lib/booking';
import { fetchDoctorSentDocuments, recentDoctorDocuments } from '@/lib/documentFiles';

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
  booked_at?: string | null;
  consultation_type?: string | null;
}

function doctorCancelReason(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/^Cancelled by doctor:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

const CANCEL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export default function Notifications() {
  usePageTitle('Needs your attention');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stalled, setStalled] = useState<StalledDoc[]>([]);
  const [critical, setCritical] = useState<CriticalFinding[]>([]);
  const [cancellations, setCancellations] = useState<CancelledAppt[]>([]);
  // Her own bookings from the last 7 days: the in-app booking confirmation.
  const [confirmed, setConfirmed] = useState<CancelledAppt[]>([]);
  // "Dr X added a document" (last 14 days), with the document's name.
  const [fromDoctor, setFromDoctor] = useState<Array<{ id: string; doctor_name: string; note: string | null; uploaded_at: string | null; name: string }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [docsRes, findingsRes, apptsResp, sentDocs] = await Promise.all([
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
        fetchDoctorSentDocuments(),
      ]);
      const docs = (docsRes.data ?? []) as Array<{ id: string; file_name: string; ai_suggested_name: string | null; ai_summary: string | null; uploaded_at: string | null }>;
      const threeMinAgo = Date.now() - 3 * 60 * 1000;
      setStalled(
        docs
          .filter(d => !d.ai_summary && d.uploaded_at && Date.parse(d.uploaded_at) < threeMinAgo)
          .slice(0, 10),
      );
      setCritical((findingsRes.data ?? []) as CriticalFinding[]);
      const docName = new Map(docs.map(d => [d.id, d.ai_suggested_name || d.file_name]));
      setFromDoctor(
        recentDoctorDocuments(sentDocs)
          .filter(d => docName.has(d.id))
          .slice(0, 10)
          .map(d => ({ ...d, name: docName.get(d.id) || 'Document' })),
      );

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
      setConfirmed(recentlyBooked(appts).slice(0, 5));
      setLoaded(true);
    };
    load();
    return onHealthDataChange(load);
  }, [user]);

  // One row style for every item: the whole row is the button.
  const Row = ({ title, detail, onClick, label }: { title: string; detail?: string; onClick: () => void; label: string }) => (
    <li>
      <button type="button" onClick={onClick} aria-label={label} className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{title}</span>
          {detail && <span className="block truncate text-[14px] text-muted-foreground">{detail}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );

  return (
    <div className="min-h-screen bg-background">
      <SubPageHeader title="Needs your attention" backTo="/dashboard/settings" backLabel="Me" />

      <div className="px-4 py-5 max-w-3xl mx-auto space-y-6">
        <PendingConnections />
        <DoctorNotesCard />

        {fromDoctor.length > 0 && (
          <section className="space-y-3" data-testid="doctor-documents">
            <h2 className="section-title">
              {fromDoctor.length === 1 ? 'A doctor added a document' : `Doctors added ${fromDoctor.length} documents`}
            </h2>
            <ul className="row-group">
              {fromDoctor.map(d => {
                const age = d.uploaded_at ? formatDistanceToNow(new Date(d.uploaded_at), { addSuffix: true }) : '';
                const detail = [d.doctor_name, age, d.note ? `“${d.note}”` : ''].filter(Boolean).join(' · ');
                return (
                  <Row
                    key={d.id}
                    title={d.name}
                    detail={detail}
                    label={`Open ${d.name} from ${d.doctor_name}`}
                    onClick={() => navigate(`/dashboard/medical-history?doc=${d.id}`)}
                  />
                );
              })}
            </ul>
          </section>
        )}

        {stalled.length > 0 && (
          <section className="space-y-3">
            <h2 className="section-title">Documents not read yet</h2>
            <ul className="row-group">
              {stalled.map(d => {
                const age = d.uploaded_at ? formatDistanceToNow(new Date(d.uploaded_at), { addSuffix: true }) : '';
                const name = d.ai_suggested_name || d.file_name;
                return (
                  <Row
                    key={d.id}
                    title={name}
                    detail={age ? `Uploaded ${age} · tap to try again` : 'Tap to try again'}
                    label={`Open ${name}`}
                    onClick={() => navigate(`/dashboard/medical-history?doc=${d.id}`)}
                  />
                );
              })}
            </ul>
          </section>
        )}

        {critical.length > 0 && (
          <section className="space-y-3">
            <h2 className="section-title">Results to show a doctor soon</h2>
            <ul className="row-group">
              {critical.slice(0, 8).map(f => (
                <Row
                  key={f.id}
                  title={f.title}
                  detail={f.value ? `${f.value}${f.unit ? ` ${f.unit}` : ''}` : undefined}
                  label={`Open ${f.title}`}
                  onClick={() => navigate(f.document_id ? `/dashboard/medical-history?doc=${f.document_id}` : '/dashboard/medical-history')}
                />
              ))}
            </ul>
          </section>
        )}

        {cancellations.length > 0 && (
          <section className="space-y-3">
            <h2 className="section-title">
              {cancellations.length === 1 ? 'A doctor cancelled your visit' : 'Visits your doctor cancelled'}
            </h2>
            <ul className="row-group">
              {cancellations.map(apt => {
                const when = new Date(apt.scheduled_at);
                const reason = doctorCancelReason(apt.notes);
                const doctor = [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || 'Your doctor';
                const time = `${when.toLocaleDateString()} at ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                return (
                  <Row
                    key={apt.id}
                    title={`${doctor} · ${time}`}
                    detail={reason ? `"${reason}" · tap to book again` : 'Tap to book again'}
                    label={`Book again after ${doctor} cancelled`}
                    onClick={() => navigate('/find-doctor')}
                  />
                );
              })}
            </ul>
          </section>
        )}

        {confirmed.length > 0 && (
          <section className="space-y-3" data-testid="booking-confirmations">
            <h2 className="section-title">
              {confirmed.length === 1 ? 'Booking confirmed' : `${confirmed.length} bookings confirmed`}
            </h2>
            <ul className="row-group">
              {confirmed.map(apt => {
                const doctor = [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || 'Your doctor';
                return (
                  <Row
                    key={apt.id}
                    title={doctor}
                    detail={`${formatVisitWhen(new Date(apt.scheduled_at))} · ${visitTypeLabel(apt.consultation_type)}`}
                    label={`View your visit with ${doctor}`}
                    onClick={() => navigate('/dashboard/appointments')}
                  />
                );
              })}
            </ul>
          </section>
        )}

        <ConnectedDoctors />

        {/* Empty-state — only after the fetch has resolved, so we don't
            momentarily claim "nothing to flag" while the data is still
            in flight. */}
        {loaded && fromDoctor.length === 0 && stalled.length === 0 && critical.length === 0 && cancellations.length === 0 && confirmed.length === 0 && (
          <div className="text-center text-[15px] text-muted-foreground py-8">
            Nothing else needs you right now.
          </div>
        )}
      </div>
    </div>
  );
}
