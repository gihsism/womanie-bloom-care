import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/integrations/db/client';
import { useToast } from '@/hooks/use-toast';
import { Calendar, CheckCircle, Video, XCircle } from '@/components/icons';
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Coming up</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingAppointments.length > 0 ? (
            <div className="space-y-4">
              {upcomingAppointments.map((apt) => (
                <div key={apt.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-4 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-primary/10 p-2 rounded-full" aria-hidden="true">
                      {apt.consultation_type === 'video' ? (
                        <Video className="h-4 w-4 text-primary" />
                      ) : (
                        <Calendar className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{patientNameFor(apt.patient_id)}</p>
                      <p className="text-sm text-muted-foreground">
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
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/doctor/patient/${apt.patient_id}`)}
                    >
                      Open chart
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
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
            <p className="text-muted-foreground text-center py-8">No visits booked. Patients book you from the doctor directory.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past and cancelled</CardTitle>
        </CardHeader>
        <CardContent>
          {pastAppointments.length > 0 ? (
            <div className="space-y-4">
              {(showAllPast ? pastAppointments : pastAppointments.slice(0, 10)).map((apt) => {
                const toClose = needsCloseout(apt, now);
                const wasResolved = apt.status === 'completed' || apt.status === 'no_show';
                return (
                  <div
                    key={apt.id}
                    className={`flex flex-wrap items-center justify-between gap-2 border-b pb-4 last:border-0 ${
                      apt.status === 'cancelled' ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{patientNameFor(apt.patient_id)}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(apt.scheduled_at).toLocaleDateString()}
                        {apt.duration ? ` · ${apt.duration} min` : ''}
                        {toClose && ' · did it happen?'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {toClose && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={busyId === apt.id}
                            onClick={() => setStatus(apt, 'completed')}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                            It happened
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground"
                            disabled={busyId === apt.id}
                            onClick={() => setStatus(apt, 'no_show')}
                          >
                            <XCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                            Patient didn't come
                          </Button>
                        </>
                      )}
                      {wasResolved && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          disabled={busyId === apt.id}
                          onClick={() => setStatus(apt, 'scheduled')}
                          title="Reopen this appointment"
                        >
                          Undo
                        </Button>
                      )}
                      {!toClose && (
                        <Badge
                          variant="outline"
                          className={
                            apt.status === 'completed'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                              : apt.status === 'no_show'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                              : 'bg-muted text-muted-foreground'
                          }
                        >
                          {apt.status === 'completed' ? 'Completed'
                            : apt.status === 'no_show' ? "Didn't come"
                            : apt.status === 'cancelled' ? 'Cancelled'
                            : apt.status || 'Booked'}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
              {pastAppointments.length > 10 && !showAllPast && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllPast(true)}>
                  Show all {pastAppointments.length}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No past visits yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelTarget !== null} onOpenChange={o => { if (!o && busyId === null) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={e => {
              e.preventDefault();
              if (cancelTarget && cancelReason.trim()) void cancelByDoctor(cancelTarget, cancelReason);
            }}
          >
            <DialogHeader>
              <DialogTitle>Cancel this visit?</DialogTitle>
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
              <Label htmlFor="cancel-reason">Reason (the patient will see this)</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. I am unwell today. Please book another time."
                maxLength={500}
                rows={3}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCancelTarget(null)} disabled={busyId !== null}>
                Keep visit
              </Button>
              <Button type="submit" variant="destructive" disabled={!cancelReason.trim() || busyId !== null}>
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
