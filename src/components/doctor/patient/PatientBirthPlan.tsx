import { Card } from '@/components/ui/card';
import { FileHeart } from 'lucide-react';
import { parsePlan, planSummary } from '@/lib/birthPlan';

// Read-only: the birth plan the patient chose to show in her doctor's
// chart (table birth_plans, migration 020). Comes from the consent-gated,
// access-logged /api/doctors/patient, which returns it only when she
// ticked "Show in my doctor's chart". Self-hides otherwise.

export interface PatientBirthPlanRow {
  plan: unknown;
  updated_at: string | null;
}

const PatientBirthPlan = ({ row }: { row: PatientBirthPlanRow | null }) => {
  if (!row) return null;
  const sections = planSummary(parsePlan(row.plan));
  if (sections.length === 0) return null;
  const updated = row.updated_at ? new Date(row.updated_at) : null;
  return (
    <Card className="p-4" aria-labelledby="patient-birth-plan" data-testid="patient-birth-plan">
      <div className="flex items-center gap-2 mb-1">
        <FileHeart className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 id="patient-birth-plan" className="text-sm font-semibold">Birth plan</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Written by the patient{updated && !Number.isNaN(updated.getTime()) ? ` · updated ${updated.toLocaleDateString([], { dateStyle: 'medium' })}` : ''} · read-only
      </p>
      <div className="space-y-3">
        {sections.map(s => (
          <section key={s.id}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{s.title}</h4>
            {s.wishes.length > 0 && (
              <ul className="text-sm list-disc pl-5 space-y-0.5">{s.wishes.map(w => <li key={w}>{w}</li>)}</ul>
            )}
            {s.note && <p className="text-sm mt-1 whitespace-pre-wrap text-foreground/90">“{s.note}”</p>}
          </section>
        ))}
      </div>
    </Card>
  );
};

export default PatientBirthPlan;
