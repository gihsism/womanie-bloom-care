import { formatWeekdayDayMonth } from '@/lib/dateFormat';
import { formatTime } from '@/lib/timeFormat';
import { Card } from '@/components/ui/card';
import { AlertTriangle, ClipboardList, FlaskConical, HeartPulse, MapPin, Pill } from 'lucide-react';
import { stageLabel } from '@/lib/doctorDashboard';
import { cycleDay, medicineLine, moodSummary, pregnancyWeek, visitSummary } from '@/lib/doctorPatient';
import { parseQuestions } from '@/lib/visitQuestions';
import { resultsToDiscuss } from '@/lib/visitPrep';
import { formatLabDay } from '@/lib/health-trends';
import type {
  HealthSignal,
  MedicalDataRow,
  PatientAppointment,
  PatientMedicine,
  PatientProfile,
  PatientVisitQuestions,
  PeriodRecord,
} from './types';

// "Before the visit": the things a gynaecologist checks first, on one
// card at the top of the Summary tab. Where she is (stage, pregnancy week
// or cycle day), what she takes, how her mood has been, and whether she is
// bringing questions. Her open questions and the results worth raising
// are listed here, chosen by the same rules as her own visit prep sheet
// (lib/visitPrep), so doctor and patient see the same list. Everything is from the consent-gated chart fetch;
// medicines and moods are what the patient logged herself, and the card
// says so.

interface Props {
  profile: PatientProfile | null;
  appointments: PatientAppointment[];
  periodRecords: PeriodRecord[];
  signals: HealthSignal[];
  medicines: PatientMedicine[];
  visitQuestions: PatientVisitQuestions[];
  /** Her extracted lab results (latest per test picked by resultsToDiscuss). */
  medicalData?: MedicalDataRow[];
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
      : <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
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

const PatientVisitBrief = ({ profile, appointments, periodRecords, signals, medicines, visitQuestions, medicalData = [], now = Date.now() }: Props) => {
  const { next } = visitSummary(appointments, now);
  const mood = moodSummary(signals);
  // The earliest upcoming visit with this doctor that has questions saved
  // (the same visit the Visits tab marks).
  const forVisit = visitQuestions
    .map(r => ({ at: Date.parse(r.scheduled_at), list: parseQuestions(r.questions) }))
    .filter(r => r.list.length > 0)
    .sort((a, b) => a.at - b.at)[0];
  const openQuestions = forVisit ? forVisit.list.filter(q => !q.asked) : [];
  const results = resultsToDiscuss(
    // Test names as the lab wrote them (the patient-friendly names are for her).
    medicalData.map(r => ({ ...r, value: r.value == null ? null : String(r.value), data_type: r.data_type ?? 'lab_result' })),
  );

  const nextLine = next
    ? `Next visit ${formatWeekdayDayMonth(next.scheduled_at)}, ${formatTime(next.scheduled_at)}${next.consultation_type ? ` · ${next.consultation_type.replace(/_/g, ' ')}` : ''}`
    : 'No visit booked with you';

  return (
    <Card className="p-4" aria-labelledby="visit-brief-title">
      <h2 id="visit-brief-title" className="text-sm font-semibold">Before the visit</h2>
      <p className="text-xs text-muted-foreground">{nextLine}</p>

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

        <Row icon={FlaskConical} label="Results worth raising" alert={results.length > 0}>
          {results.length === 0 ? (
            <span className="text-muted-foreground">
              {medicalData.length === 0 ? 'No results yet' : 'None outside the range or changed since the previous test'}
            </span>
          ) : (
            <ul className="space-y-1" data-testid="brief-results">
              {results.map(r => (
                <li key={r.name}>
                  <span className="font-medium">{r.name}</span> {r.value}
                  <span className="text-muted-foreground">
                    {r.range ? ` (ref. ${r.range})` : ''}{r.date ? ` · ${formatLabDay(r.date)}` : ''}
                  </span>
                  <span className="block text-xs text-muted-foreground">{r.note}</span>
                </li>
              ))}
            </ul>
          )}
        </Row>

        <Row icon={ClipboardList} label="Her open questions for the visit">
          {!forVisit ? (
            <span className="text-muted-foreground">None saved</span>
          ) : openQuestions.length === 0 ? (
            'All marked as asked'
          ) : (
            <ul className="list-disc pl-4 space-y-0.5" data-testid="brief-questions">
              {openQuestions.map(q => <li key={q.id}>{q.text}</li>)}
            </ul>
          )}
        </Row>
      </div>
    </Card>
  );
};

export default PatientVisitBrief;
