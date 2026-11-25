import { Calendar, Video } from 'lucide-react';
import { parseQuestions } from '@/lib/visitQuestions';
import { QuestionList } from './PatientVisitQuestions';
import type { PatientAppointment, PatientVisitQuestions } from './types';

// Visits tab: every visit with this doctor, newest first (the API already
// orders scheduled_at DESC). Status in plain words, shown once. Under an
// upcoming visit: the questions she saved for it (read-only; the API only
// returns them for this doctor's own, not-cancelled, upcoming visits).

const STATUS: Record<string, string> = {
  completed: 'Completed',
  no_show: "Didn't come",
  cancelled: 'Cancelled',
  scheduled: 'Booked',
};

const PatientVisits = ({ appointments, visitQuestions = [] }: { appointments: PatientAppointment[]; visitQuestions?: PatientVisitQuestions[] }) => {
  if (appointments.length === 0) {
    return <p className="row-group px-4 py-6 text-center text-[15px] text-muted-foreground">No visits with this patient yet.</p>;
  }
  const now = Date.now();
  const questionsFor = new Map(visitQuestions.map(r => [String(r.appointment_id), parseQuestions(r.questions)]));
  return (
    <div className="row-group">
      {appointments.map(apt => {
        const when = new Date(apt.scheduled_at);
        const s = (apt.status || 'scheduled').toLowerCase();
        const label = s === 'scheduled' && when.getTime() < now ? 'Not closed yet' : STATUS[s] ?? apt.status;
        const Icon = apt.consultation_type === 'video' ? Video : Calendar;
        const questions = s === 'cancelled' ? [] : questionsFor.get(String(apt.id)) ?? [];
        return (
          <div key={apt.id} className="flex items-start gap-3 min-h-14 px-4 py-3">
            <Icon
              className={`h-5 w-5 mt-0.5 shrink-0 ${s === 'cancelled' ? 'text-muted-foreground' : 'text-stage-accent'}`}
              strokeWidth={1.9}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className={`text-[17px] font-medium ${s === 'cancelled' ? 'text-muted-foreground' : ''}`}>
                {when.toLocaleDateString()} at {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-[14px] text-muted-foreground">
                {apt.consultation_type === 'video' ? 'Video' : 'In person'} ·{' '}
                <span className={label === 'Not closed yet' ? 'font-semibold text-foreground' : ''}>{label}</span>
              </p>
              {apt.notes && <p className="text-[14px] text-muted-foreground mt-1">{apt.notes}</p>}
              {questions.length > 0 && (
                <div className="mt-2 rounded-xl bg-muted/50 p-3" aria-label="Questions she's bringing to this visit">
                  <p className="text-[14px] font-medium mb-1">Questions she's bringing ({questions.length}) · written by the patient</p>
                  <QuestionList list={questions} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PatientVisits;
