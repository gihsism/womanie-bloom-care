import { CheckCircle2, ChevronRight, Circle, Clock } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { setupProgress, type SetupStep } from '@/lib/doctorSetup';

// Doctor home: "Get ready for bookings". Shown until every step is done;
// each open step jumps to its setting in Profile & settings.

interface Props {
  steps: SetupStep[];
  onGo: (anchor: string) => void;
}

export default function DoctorSetupChecklist({ steps, onGo }: Props) {
  const p = setupProgress(steps);
  if (p.complete) return null;
  const pct = Math.round((p.done / p.total) * 100);

  return (
    <Card aria-labelledby="setup-title">
      <CardHeader className="pb-3">
        <CardTitle id="setup-title" className="text-base">Get ready for bookings</CardTitle>
        <CardDescription>
          {p.bookable
            ? 'Patients can find and book you now. A few details will make your profile more helpful.'
            : 'Patients cannot find you in Find a Doctor yet. The steps marked "needed" make you bookable.'}
        </CardDescription>
        <div className="pt-2 space-y-1">
          <Progress value={pct} aria-label={`Setup ${p.done} of ${p.total} done`} />
          <p className="text-xs text-muted-foreground">{p.done} of {p.total} done</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {steps.map(step => {
            const waiting = step.id === 'licence' && !step.done;
            const Icon = step.done ? CheckCircle2 : waiting ? Clock : Circle;
            const body = (
              <>
                <Icon
                  className={`h-5 w-5 shrink-0 mt-0.5 ${step.done ? 'text-secondary' : 'text-muted-foreground'}`}
                  aria-hidden="true"
                />
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium ${step.done ? 'text-muted-foreground line-through' : ''}`}>
                    {step.label}
                    {step.required && !step.done && (
                      <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-destructive">needed</span>
                    )}
                    <span className="sr-only">{step.done ? ' (done)' : ' (not done)'}</span>
                  </span>
                  {!step.done && <span className="block text-xs text-muted-foreground mt-0.5">{step.hint}</span>}
                </span>
                {!step.done && step.anchor && <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />}
              </>
            );
            return (
              <li key={step.id}>
                {!step.done && step.anchor ? (
                  <button
                    type="button"
                    onClick={() => onGo(step.anchor!)}
                    className="w-full flex items-start gap-3 py-3 text-left hover:bg-muted/50 rounded-md px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-3 py-3 px-1">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
