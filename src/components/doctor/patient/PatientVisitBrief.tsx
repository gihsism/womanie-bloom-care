import { AlertTriangle, ClipboardList, HeartPulse, MapPin, Pill } from 'lucide-react';
import { stageLabel } from '@/lib/doctorDashboard';
import { cycleDay, medicineLine, moodSummary, pregnancyWeek, visitSummary } from '@/lib/doctorPatient';
import { parseQuestions } from '@/lib/visitQuestions';
import type {
  HealthSignal,
  PatientAppointment,
  PatientMedicine,
  PatientProfile,
  PatientVisitQuestions,
  PeriodRecord,
} from './types';

// "Before the visit": the five things a gynaecologist checks first, on one
// card at the top of the Summary tab. Where she is (stage, pregnancy week
// or cycle day), what she takes, how her mood has been, and whether she is
// bringing questions. Everything is from the consent-gated chart fetch;
// medicines and moods are what the patient logged herself, and the card
// says so.

interface Props {
  profile: PatientProfile | null;
  appointments: PatientAppointment[];
  periodRecords: PeriodRecord[];
  signals: HealthSignal[];
  medicines: PatientMedicine[];
  visitQuestions: PatientVisitQuestions[];
  now?: number;
}

const Row = ({
  icon: Icon,
  label,
  children,
  alert,
}: {
  icon: typeof Pill;
  label: string;
  children: React.ReactNode;
  alert?: boolean;
}) => (
  <div className="flex items-start gap-3 py-2.5">
    {alert
      ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-label="Worth a look" />
      : <Icon className="h-4 w-4 mt-0.5 shrink-0 text-stage-accent" aria-hidden="true" />}
    <div className="min-w-0 flex-1">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="text-[15px]">{children}</div>
    </div>
  </div>
);

function whereSheIs(profile: PatientProfile | null, periods: PeriodRecord[], now: number): string {
  const preg = pregnancyWeek(profile?.pregnancy_due_date ?? null, now);
  const day = preg ? null : cycleDay(periods, profile?.life_stage ?? null, now);
  return [
    stageLabel(profile?.life_stage) ?? 'Life stage not set',
    preg ? `week ${preg.week}` : null,
    day ? `cycle day ${day}` : null,
    profile?.ivf_phase ? `IVF: ${profile.ivf_phase}` : null,
  ].filter(Boolean).join(' · ');
}

const PatientVisitBrief = ({ profile, appointments, periodRecords, signals, medicines, visitQuestions, now = Date.now() }: Props) => {
  const { next } = visitSummary(appointments, now);
  const mood = moodSummary(signals);
  // Same visit as the "Questions she's bringing" card below: the earliest
  // upcoming one with any questions saved.
  const forVisit = visitQuestions
    .map(r => ({ at: Date.parse(r.scheduled_at), list: parseQuestions(r.questions) }))
    .filter(r => r.list.length > 0)
    .sort((a, b) => a.at - b.at)[0];
  const openQuestions = forVisit ? forVisit.list.filter(q => !q.asked).length : 0;

  const nextLine = next
    ? `Next visit ${new Date(next.scheduled_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${next.consultation_type ? ` · ${next.consultation_type.replace(/_/g, ' ')}` : ''}`
    : 'No visit booked with you';

  return (
    <section className="panel p-4" aria-labelledby="visit-brief-title">
      <h2 id="visit-brief-title" className="text-[17px] font-semibold">Before the visit</h2>
      <p className="text-[14px] text-muted-foreground">{nextLine}</p>

      <div className="mt-2 divide-y">
        <Row icon={MapPin} label="Where she is">
          {whereSheIs(profile, periodRecords, now)}
        </Row>

        <Row icon={Pill} label="Current medicines (her own log)">
          {medicines.length === 0 ? (
            <span className="text-muted-foreground">None recorded</span>
          ) : (
            <ul className="space-y-0.5">
              {medicines.map(m => <li key={m.id}>{medicineLine(m)}</li>)}
            </ul>
          )}
        </Row>

        <Row icon={HeartPulse} label="Mood, last 30 days" alert={mood.needsAttention}>
          {mood.loggedDays === 0 ? (
            <span className="text-muted-foreground">Not logged</span>
          ) : mood.lowDays === 0 ? (
            `No low mood on ${mood.loggedDays} logged day${mood.loggedDays === 1 ? '' : 's'}`
          ) : (
            <>
              Low mood on {mood.lowDays} of {mood.loggedDays} logged day{mood.loggedDays === 1 ? '' : 's'}
              <span className="text-muted-foreground"> · {mood.low.map(l => `${l.label} ${l.days}`).join(', ')}</span>
            </>
          )}
        </Row>

        <Row icon={ClipboardList} label="Questions for the visit">
          {!forVisit
            ? <span className="text-muted-foreground">None saved</span>
            : openQuestions === 0
            ? 'All marked as asked'
            : `${openQuestions} open question${openQuestions === 1 ? '' : 's'}, listed below`}
        </Row>
      </div>
    </section>
  );
};

export default PatientVisitBrief;
