import { Card } from '@/components/ui/card';
import { Check, ClipboardList } from '@/components/icons';
import { parseQuestions, type VisitQuestion } from '@/lib/visitQuestions';
import type { PatientVisitQuestions as Row } from './types';

// Read-only: the questions the patient saved for her next visit with you.
// Comes from the consent-gated, access-logged /api/doctors/patient.
// Self-hides when she saved none.

/** The questions as a read-only list; asked ones ticked and struck through. */
export function QuestionList({ list }: { list: VisitQuestion[] }) {
  return (
    <ul className="space-y-1.5">
      {list.map(q => (
        <li key={q.id} className="flex items-start gap-2 text-sm">
          {q.asked
            ? <Check className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-label="Marked as asked" />
            : <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" aria-hidden="true" />}
          <span className={q.asked ? 'text-muted-foreground line-through' : ''}>{q.text}</span>
        </li>
      ))}
    </ul>
  );
}

const PatientVisitQuestions = ({ rows }: { rows: Row[] }) => {
  const next = rows
    .map(r => ({ ...r, list: parseQuestions(r.questions) }))
    .filter(r => r.list.length > 0)
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
  if (!next) return null;
  const when = new Date(next.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Card className="p-4" aria-labelledby="patient-visit-questions">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 id="patient-visit-questions" className="text-sm font-semibold">Questions she's bringing</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">For the visit on {when} · written by the patient</p>
      <QuestionList list={next.list} />
    </Card>
  );
};

export default PatientVisitQuestions;
