import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
} from './types';

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
    className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
  >
    <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${tone === 'alert' ? 'text-amber-600' : 'text-primary'}`} aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium">{title}</span>
      {detail && <span className="block text-xs text-muted-foreground mt-0.5">{detail}</span>}
    </span>
    <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
  </button>
);

const PatientSummary = ({ medicalData, documents, notes, appointments, signals, periodRecords, lifeStage, onOpenTab }: Props) => {
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
      <Card className="divide-y">
        <SummaryRow
          icon={flagged.length > 0 ? AlertTriangle : FileText}
          tone={flagged.length > 0 ? 'alert' : undefined}
          title={resultsTitle}
          detail={flagged.length > 0 && (
            <span className="flex flex-wrap gap-1 mt-1">
              {flagged.slice(0, 3).map(r => (
                <Badge key={r.id} variant="outline" className="text-[11px] font-normal">
                  {r.title}{fmtValue(r)} · {(r.status || '').toLowerCase()}
                </Badge>
              ))}
              {flagged.length > 3 && <span className="text-xs">+{flagged.length - 3} more</span>}
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
      </Card>

      {/* What the patient tracked herself. Self-hides empty blocks. */}
      <DoctorPatientTrackingSummary periodRecords={periodRecords} signals={signals} lifeStage={lifeStage} />

      {signals.length > 0 && (
        <Card>
          <button
            type="button"
            className="flex w-full items-center justify-between p-3 text-left text-sm font-medium"
            aria-expanded={logsOpen}
            onClick={() => setLogsOpen(o => !o)}
          >
            Daily logs, last 30 days ({signals.length})
            <ChevronDown className={`h-4 w-4 transition-transform ${logsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {logsOpen && (
            <div className="divide-y border-t">
              {signals.map(s => {
                const parts = [
                  s.symptoms?.length ? `Symptoms: ${s.symptoms.join(', ')}` : null,
                  s.mood?.length ? `Mood: ${s.mood.join(', ')}` : null,
                  s.discharge ? `Discharge: ${s.discharge}` : null,
                ].filter(Boolean);
                return (
                  <div key={s.id} className="p-3 text-sm">
                    <p className="font-medium">
                      {new Date(s.signal_date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    {parts.length > 0 && <p className="text-xs text-muted-foreground">{parts.join(' · ')}</p>}
                    {s.notes && <p className="text-xs mt-1">{s.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default PatientSummary;
