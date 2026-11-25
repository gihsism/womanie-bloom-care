import { useState } from 'react';
import { Card } from '@/components/ui/card';
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
    <Card className="p-4" aria-labelledby="new-since-title">
      <h2 id="new-since-title" className="text-sm font-semibold">New since last visit</h2>
      <p className="text-xs text-muted-foreground">
        {lastVisitAt === null
          ? 'No completed visit with you yet, so everything in the chart is new to you.'
          : `Since ${new Date(lastVisitAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`}
      </p>

      {lastVisitAt !== null && (
        items.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing new since then.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {visible.map(item => {
              const Icon = item.flagged ? AlertTriangle : ICON[item.kind];
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onOpenTab(TAB[item.kind])}
                    className="flex w-full items-start gap-3 py-2 text-left hover:bg-muted/40 transition-colors"
                  >
                    <Icon
                      className={`h-4 w-4 mt-0.5 shrink-0 ${item.flagged ? 'text-amber-600' : 'text-muted-foreground'}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">
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
        <button type="button" onClick={() => setExpanded(e => !e)} className="mt-1 text-sm text-primary">
          {expanded ? 'Show less' : `Show ${items.length - MAX_ROWS} more`}
        </button>
      )}
    </Card>
  );
};

export default PatientNewSince;
