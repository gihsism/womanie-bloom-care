import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Calendar, ChevronDown, ChevronRight, FileText, MessageSquare } from 'lucide-react';
import DoctorPatientTrackingSummary from '@/components/dashboard/DoctorPatientTrackingSummary';
import { flaggedResults, visitSummary, type PatientTab } from '@/lib/doctorPatient';
import type {
  DoctorNote,
  HealthDocument,
  HealthSignal,
  MedicalDataRow,
  PatientAppointment,
  PeriodRecord,
  PatientVisitQuestions as VisitQuestionsRow,
} from './types';
import PatientVisitQuestions from './PatientVisitQuestions';

// Summary tab: one screen that answers "what do I need to know?". Four
// rows (results out of range, visits, documents, notes), each opening its
// tab, then what the patient tracked herself, then her daily logs folded.

interface Props {
  medicalData: MedicalDataRow[];
  documents: HealthDocument[];
  notes: DoctorNote[];
  appointments: PatientAppointment[];
  signals: HealthSignal[];
  periodRecords: PeriodRecord[];
  lifeStage: string | null;
  /** Questions she saved for her upcoming visits with this doctor. */
  visitQuestions?: VisitQuestionsRow[];
  onOpenTab: (tab: PatientTab) => void;
}

const fmtValue = (r: MedicalDataRow) =>
  r.value === null || r.value === '' ? '' : ` ${r.value}${r.unit ? ` ${r.unit}` : ''}`;

const SummaryRow = ({
  icon: Icon,
  title,
  detail,
  onClick,
  tone,
}: {
  icon: typeof FileText;
  title: string;
  detail?: React.ReactNode;
  onClick: () => void;
  tone?: 'alert';
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-start gap-3 min-h-14 px-4 py-3 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stage-accent"
  >
    <Icon
      className={`h-5 w-5 mt-0.5 shrink-0 ${tone === 'alert' ? 'text-destructive' : 'text-stage-accent'}`}
      strokeWidth={1.9}
      aria-hidden="true"
    />
    <span className="min-w-0 flex-1">
      <span className={`block text-[17px] font-medium ${tone === 'alert' ? 'text-destructive' : ''}`}>{title}</span>
      {detail && <span className="block text-[14px] text-muted-foreground mt-0.5">{detail}</span>}
    </span>
    <ChevronRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
  </button>
);

const PatientSummary = ({ medicalData, documents, notes, appointments, signals, periodRecords, lifeStage, visitQuestions = [], onOpenTab }: Props) => {
  const [logsOpen, setLogsOpen] = useState(false);
  const flagged = flaggedResults(medicalData);
  const { last, next } = visitSummary(appointments, Date.now());
  const newestDoc = documents[0]?.uploaded_at ? new Date(documents[0].uploaded_at) : null;

  const resultsTitle =
    medicalData.length === 0
      ? 'No results yet'
      : flagged.length === 0
      ? 'All latest results in range'
      : `${flagged.length} result${flagged.length === 1 ? '' : 's'} out of range`;

  const visitParts = [
    last ? `Last: ${new Date(last.scheduled_at).toLocaleDateString()}` : 'No past visits',
    next ? `Next: ${new Date(next.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      <div className="row-group">
        <SummaryRow
          icon={flagged.length > 0 ? AlertTriangle : FileText}
          tone={flagged.length > 0 ? 'alert' : undefined}
          title={resultsTitle}
          detail={flagged.length > 0 && (
            <span className="flex flex-wrap gap-1.5 mt-1.5">
              {flagged.slice(0, 3).map(r => (
                <span key={r.id} className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[13px] text-destructive">
                  <span className="font-semibold">{r.title}{fmtValue(r)}</span> · {(r.status || '').toLowerCase()}
                </span>
              ))}
              {flagged.length > 3 && <span className="self-center text-[13px]">+{flagged.length - 3} more</span>}
            </span>
          )}
          onClick={() => onOpenTab('results')}
        />
        <SummaryRow icon={Calendar} title="Visits" detail={visitParts} onClick={() => onOpenTab('visits')} />
        <SummaryRow
          icon={FileText}
          title={`${documents.length} document${documents.length === 1 ? '' : 's'}`}
          detail={newestDoc ? `Newest ${formatDistanceToNow(newestDoc, { addSuffix: true })}` : 'None uploaded yet'}
          onClick={() => onOpenTab('documents')}
        />
        <SummaryRow
          icon={MessageSquare}
          title={`${notes.length} note${notes.length === 1 ? '' : 's'} from you`}
          detail={notes[0] ? `Latest: ${notes[0].title}` : 'None yet'}
          onClick={() => onOpenTab('notes')}
        />
      </div>

      {/* Her questions for the next visit with you. Self-hides when none. */}
      <PatientVisitQuestions rows={visitQuestions} />

      {/* What the patient tracked herself. Self-hides empty blocks. */}
      <DoctorPatientTrackingSummary periodRecords={periodRecords} signals={signals} lifeStage={lifeStage} />

      {signals.length > 0 && (
        <div className="row-group">
          <button
            type="button"
            className="flex w-full items-center justify-between min-h-14 px-4 py-3 text-left text-[17px] font-medium hover:bg-muted/50"
            aria-expanded={logsOpen}
            onClick={() => setLogsOpen(o => !o)}
          >
            Daily logs, last 30 days ({signals.length})
            <ChevronDown className={`h-4 w-4 transition-transform ${logsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {logsOpen && (
            <div className="divide-y divide-line border-t border-line">
              {signals.map(s => {
                const parts = [
                  s.symptoms?.length ? `Symptoms: ${s.symptoms.join(', ')}` : null,
                  s.mood?.length ? `Mood: ${s.mood.join(', ')}` : null,
                  s.discharge ? `Discharge: ${s.discharge}` : null,
                ].filter(Boolean);
                return (
                  <div key={s.id} className="px-4 py-3 text-[15px]">
                    <p className="font-semibold">
                      {new Date(s.signal_date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    {parts.length > 0 && <p className="text-[14px] text-muted-foreground">{parts.join(' · ')}</p>}
                    {s.notes && <p className="text-[14px] mt-1">{s.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PatientSummary;
