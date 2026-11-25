import { useState } from 'react';
import { AlertTriangle, BookOpen, FileText, FlaskConical, MessageSquare } from 'lucide-react';
import { newSinceLastVisit, type SinceItem } from '@/lib/doctorDay';
import type { PatientTab } from '@/lib/doctorPatient';
import type { DoctorNote, HealthDocument, HealthSignal, MedicalDataRow, PatientAppointment } from './types';

// "New since last visit": documents, results and notes that reached the
// chart after her previous COMPLETED appointment with this doctor. Built
// from the consent-gated chart payload already loaded (no extra fetch).
// Each row opens the tab that holds it.

interface Props {
  appointments: PatientAppointment[];
  documents: HealthDocument[];
  medicalData: MedicalDataRow[];
  notes: DoctorNote[];
  signals: HealthSignal[];
  onOpenTab: (tab: PatientTab) => void;
  now?: number;
}

const MAX_ROWS = 5;

const ICON = { document: FileText, result: FlaskConical, note: MessageSquare, log: BookOpen } as const;
const TAB: Record<SinceItem['kind'], PatientTab> = { document: 'documents', result: 'results', note: 'notes', log: 'summary' };

const PatientNewSince = ({ appointments, documents, medicalData, notes, signals, onOpenTab, now = Date.now() }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const { lastVisitAt, items } = newSinceLastVisit({ appointments, documents, medicalData, notes, signals, now });
  const visible = expanded ? items : items.slice(0, MAX_ROWS);

  return (
    <section className="panel px-4 pt-4 pb-2" aria-labelledby="new-since-title">
      <h2 id="new-since-title" className="section-title">New since last visit</h2>
      <p className="mt-0.5 pb-2 text-[14px] text-muted-foreground">
        {lastVisitAt === null
          ? 'No completed visit with you yet, so everything in the chart is new to you.'
          : `Since ${new Date(lastVisitAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`}
      </p>

      {lastVisitAt !== null && (
        items.length === 0 ? (
          <p className="pb-2 text-[15px] text-muted-foreground">Nothing new since then.</p>
        ) : (
          <ul className="-mx-4 border-t border-line divide-y divide-line">
            {visible.map(item => {
              const Icon = item.flagged ? AlertTriangle : ICON[item.kind];
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onOpenTab(TAB[item.kind])}
                    className="flex w-full items-start gap-3 min-h-14 px-4 py-3 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stage-accent"
                  >
                    <Icon
                      className={`h-5 w-5 mt-0.5 shrink-0 ${item.flagged ? 'text-destructive' : 'text-stage-accent'}`}
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-medium truncate">{item.title}</span>
                      <span className="block text-[14px] text-muted-foreground">
                        {item.detail} · {new Date(item.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}
      {items.length > MAX_ROWS && (
        <button type="button" onClick={() => setExpanded(e => !e)} className="-mx-4 block w-[calc(100%+2rem)] min-h-12 border-t border-line px-4 text-[15px] font-semibold text-stage-accent hover:bg-muted/50">
          {expanded ? 'Show less' : `Show ${items.length - MAX_ROWS} more`}
        </button>
      )}
    </section>
  );
};

export default PatientNewSince;
