import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/integrations/db/client';
import { useToast } from '@/hooks/use-toast';
import { Calendar, CheckCircle, Video, XCircle } from 'lucide-react';
import {
  needsCloseout,
  pastAppointments as pastOf,
  patientName,
  upcomingAppointments as upcomingOf,
  type DoctorAppointment as Appointment,
  type DoctorPatientConnection as PatientConnection,
} from '@/lib/doctorDashboard';

// The doctor's Appointments view: upcoming visits (open chart / cancel)
// and past visits, most recent first, with the close-out actions.

const AppointmentsView = ({ appointments, patients, onChange }: { appointments: Appointment[]; patients: PatientConnection[]; onChange: () => void }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAllPast, setShowAllPast] = useState(false);
  // The visit being cancelled (dialog open) and the reason typed so far.
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const patientNameFor = (patientId: string): string => patientName(patients, patientId);
  const now = Date.now();
  const upcomingAppointments = upcomingOf(appointments, now);
  // Most recent first; visits still waiting to be closed float to the top.
  const pastAppointments = [...pastOf(appointments, now)].sort(
    (a, b) => Number(needsCloseout(b, now)) - Number(needsCloseout(a, now))
  );

  // Doctor-initiated cancellation. The patient-side flow already
  // handles cancelling their own appointment; this lets the doctor
  // call off a visit they can't make and tell the patient why.
  // Reason is stamped into appointments.notes (no other surface writes
  // there) with a "Cancelled by doctor: <reason>" prefix so the patient
  // Appointments page can render the reason cleanly.
  const openCancel = (apt: Appointment) => {
    setCancelReason('');
    setCancelTarget(apt);
  };

  const cancelByDoctor = async (apt: Appointment, reason: string) => {
    const patientLabel = patientNameFor(apt.patient_id);
    const trimmed = reason.trim();
    if (!trimmed) {
      toast({
        variant: 'destructive',
        title: 'Reason required',
        description: 'Add a short reason so the patient understands why.',
      });
      return;
    }
    setBusyId(apt.id);
    try {
      const { error } = await db
        .from('appointments')
        .update({ status: 'cancelled', notes: `Cancelled by doctor: ${trimmed}` })
        .eq('id', apt.id);
      if (error) throw error;
      setCancelTarget(null);
      toast({
        title: 'Appointment cancelled',
        description: `${patientLabel} will see the cancellation and reason in their Appointments view.`,
      });
      onChange();
    } catch (e) {
      console.error('Doctor cancel failed:', e);
      toast({ variant: 'destructive', title: 'Could not cancel', description: 'Please try again.' });
    } finally {
      setBusyId(null);
    }
  };

  // Visit closeout. After a scheduled appointment is in the past, the
  // doctor is the only one who knows whether the patient turned up —
  // these actions stamp the row so it stops looking ambiguous on both
  // dashboards (and the patient's past-appointments view).
  const setStatus = async (apt: Appointment, next: 'completed' | 'no_show' | 'scheduled') => {
    setBusyId(apt.id);
    try {
      const { error } = await db
        .from('appointments')
        .update({ status: next })
        .eq('id', apt.id);
      if (error) throw error;
      const label = next === 'completed' ? 'Marked completed'
        : next === 'no_show' ? 'Marked no-show'
        : 'Reopened';
      // After marking a visit completed, offer a one-click jump into the
      // patient's chart with the notes form pre-opened and the title
      // pre-filled with "Visit on <date>". Keeps the doctor's after-visit
      // documentation flow tight: complete the row, write a quick note,
      // done.
      if (next === 'completed') {
        const isoDate = apt.scheduled_at.split('T')[0];
        const visitUrl = `/doctor/patient/${apt.patient_id}?addNote=visit&date=${isoDate}`;
        toast({
          title: label,
          description: `${patientNameFor(apt.patient_id)} · ${new Date(apt.scheduled_at).toLocaleDateString()}`,
          action: (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(visitUrl)}
            >
              Add visit note
            </Button>
          ),
        });
      } else {
        toast({ title: label, description: `${patientNameFor(apt.patient_id)} · ${new Date(apt.scheduled_at).toLocaleDateString()}` });
      }
      onChange();
    } catch (e) {
      console.error('Failed to update appointment status:', e);
      toast({ variant: 'destructive', title: 'Could not update', description: 'Please try again.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-7">
      <section aria-labelledby="doctor-upcoming-heading" className="space-y-3">
        <h2 id="doctor-upcoming-heading" className="section-title">Coming up</h2>
        {upcomingAppointments.length > 0 ? (
          <div className="row-group">
            {upcomingAppointments.map((apt) => (
                <div key={apt.id} className="px-4 pt-3 pb-1.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid place-items-center h-11 w-11 shrink-0 rounded-full bg-stage-tint" aria-hidden="true">
                      {apt.consultation_type === 'video' ? (
                        <Video className="h-5 w-5 text-stage-accent" strokeWidth={1.9} />
                      ) : (
                        <Calendar className="h-5 w-5 text-stage-accent" strokeWidth={1.9} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[17px] font-semibold truncate">{patientNameFor(apt.patient_id)}</p>
                      <p className="text-[14px] text-muted-foreground">
                        {new Date(apt.scheduled_at).toLocaleDateString([], {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        at {new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {apt.duration ? ` · ${apt.duration} min` : ''}
                        {' · '}{apt.consultation_type === 'video' ? 'Video' : 'In person'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1 pl-[3.25rem] -mx-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 text-[14px] font-semibold text-stage-accent hover:text-stage-accent"
                      onClick={() => navigate(`/doctor/patient/${apt.patient_id}`)}
                    >
                      Open chart
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 text-[14px] font-semibold text-muted-foreground hover:text-destructive"
                      onClick={() => openCancel(apt)}
                      disabled={busyId === apt.id}
                    >
                      Cancel visit
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="row-group px-4 py-4 text-[15px] text-muted-foreground">No visits booked. Patients book you from the doctor directory.</p>
        )}
      </section>

      <section aria-labelledby="doctor-past-heading" className="space-y-3">
        <h2 id="doctor-past-heading" className="section-title">Past and cancelled</h2>
          {pastAppointments.length > 0 ? (
            <div className="row-group">
              {(showAllPast ? pastAppointments : pastAppointments.slice(0, 10)).map((apt) => {
                const toClose = needsCloseout(apt, now);
                const wasResolved = apt.status === 'completed' || apt.status === 'no_show';
                return (
                  <div
                    key={apt.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3"
                  >
                    {/* Name and date keep a readable width; the close-out
                        buttons wrap onto their own line on a phone. */}
                    <div className="min-w-[11rem] flex-1">
                      <p className={`text-[17px] font-medium ${apt.status === 'cancelled' ? 'text-muted-foreground' : ''}`}>
                        {patientNameFor(apt.patient_id)}
                      </p>
                      <p className="text-[14px] text-muted-foreground">
                        {new Date(apt.scheduled_at).toLocaleDateString()}
                        {apt.duration ? ` · ${apt.duration} min` : ''}
                        {toClose && <span className="font-semibold text-foreground"> · did it happen?</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {toClose && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 text-[13px] font-semibold border-stage-accent bg-background text-stage-accent hover:text-stage-accent"
                            disabled={busyId === apt.id}
                            onClick={() => setStatus(apt, 'completed')}
                          >
                            <CheckCircle className="h-4 w-4" aria-hidden="true" />
                            It happened
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 text-[13px] font-semibold text-muted-foreground"
                            disabled={busyId === apt.id}
                            onClick={() => setStatus(apt, 'no_show')}
                          >
                            <XCircle className="h-4 w-4" aria-hidden="true" />
                            Patient didn't come
                          </Button>
                        </>
                      )}
                      {wasResolved && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 px-2 text-[13px] font-semibold text-muted-foreground"
                          disabled={busyId === apt.id}
                          onClick={() => setStatus(apt, 'scheduled')}
                          title="Reopen this appointment"
                        >
                          Undo
                        </Button>
                      )}
                      {!toClose && (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
                            apt.status === 'completed'
                              ? 'bg-stage-tint text-stage-accent'
                              : apt.status === 'no_show'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {apt.status === 'completed' ? 'Completed'
                            : apt.status === 'no_show' ? "Didn't come"
                            : apt.status === 'cancelled' ? 'Cancelled'
                            : apt.status || 'Booked'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {pastAppointments.length > 10 && !showAllPast && (
                <button
                  type="button"
                  className="w-full min-h-12 px-4 text-[15px] font-semibold text-stage-accent hover:bg-muted/50"
                  onClick={() => setShowAllPast(true)}
                >
                  Show all {pastAppointments.length}
                </button>
              )}
            </div>
          ) : (
            <p className="row-group px-4 py-4 text-[15px] text-muted-foreground">No past visits yet.</p>
          )}
      </section>

      <Dialog open={cancelTarget !== null} onOpenChange={o => { if (!o && busyId === null) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-md rounded-[1.25rem]">
          <form
            onSubmit={e => {
              e.preventDefault();
              if (cancelTarget && cancelReason.trim()) void cancelByDoctor(cancelTarget, cancelReason);
            }}
          >
            <DialogHeader>
              <DialogTitle className="section-title">Cancel this visit?</DialogTitle>
              <DialogDescription>
                {cancelTarget && (
                  <>
                    {patientNameFor(cancelTarget.patient_id)} ·{' '}
                    {new Date(cancelTarget.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="cancel-reason" className="text-[15px] font-semibold">Reason (the patient will see this)</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. I am unwell today. Please book another time."
                maxLength={500}
                rows={3}
                autoFocus
                className="rounded-2xl text-[16px]"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="h-11 border-line" onClick={() => setCancelTarget(null)} disabled={busyId !== null}>
                Keep visit
              </Button>
              <Button type="submit" variant="destructive" className="h-11" disabled={!cancelReason.trim() || busyId !== null}>
                {busyId !== null ? 'Cancelling…' : 'Cancel visit'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AppointmentsView;
