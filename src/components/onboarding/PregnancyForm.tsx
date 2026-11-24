import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { cn } from '@/lib/utils';
import OnboardingScreen from './OnboardingScreen';
import { Choice, ChoiceGroup, DateField, FIELD, FieldLabel } from './Choice';
import type { StageFormProps } from './stageForm';

// Pregnancy. Screen 2: how far along (last period, due date or week).
// Screen 3: first pregnancy? plus anything the doctor is watching.
type DateType = 'lastPeriod' | 'dueDate' | 'currentWeek';
const WAYS: { value: DateType; label: string }[] = [
  { value: 'lastPeriod', label: 'Last period' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'currentWeek', label: 'Current week' },
];

const PregnancyForm = ({ part, onNext, onBack, onFinish }: StageFormProps) => {
  const { data, updatePregnancy } = useOnboarding();

  const [dateType, setDateType] = useState<DateType>(data.pregnancy?.dateType || 'lastPeriod');
  const [lastPeriodDate, setLastPeriodDate] = useState<Date | undefined>(data.pregnancy?.lastPeriodDate);
  const [dueDate, setDueDate] = useState<Date | undefined>(data.pregnancy?.dueDate);
  const [currentWeek, setCurrentWeek] = useState<string | number>(data.pregnancy?.currentWeek || '');
  const [firstPregnancy, setFirstPregnancy] = useState(
    data.pregnancy?.firstPregnancy !== undefined ? data.pregnancy.firstPregnancy.toString() : ''
  );
  const [complications, setComplications] = useState(data.pregnancy?.complications || '');

  const dateValid = () => {
    if (dateType === 'lastPeriod' && !lastPeriodDate) return false;
    if (dateType === 'dueDate' && !dueDate) return false;
    if (dateType === 'currentWeek' && (!currentWeek || Number(currentWeek) < 1 || Number(currentWeek) > 42)) return false;
    return true;
  };
  const isFormValid = () => dateValid() && firstPregnancy !== '';

  const save = () => updatePregnancy({
    dateType,
    lastPeriodDate: dateType === 'lastPeriod' ? lastPeriodDate : undefined,
    dueDate: dateType === 'dueDate' ? dueDate : undefined,
    currentWeek: dateType === 'currentWeek' ? Number(currentWeek) : 0,
    ...(firstPregnancy !== '' ? { firstPregnancy: firstPregnancy === 'true' } : {}),
    complications,
  });

  if (part === 0 || !dateValid()) {
    return (
      <OnboardingScreen
        step={2}
        title="How far along are you?"
        sub="Pick whichever you know. We work out the week and the due date."
        onBack={onBack}
        primary={{ label: 'Continue', disabled: !dateValid(), onClick: () => { save(); onNext(); } }}
      >
        <div role="radiogroup" aria-label="What do you know?" className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
          {WAYS.map((w) => (
            <button
              key={w.value}
              type="button"
              role="radio"
              aria-checked={dateType === w.value}
              onClick={() => setDateType(w.value)}
              className={cn(
                'min-h-11 rounded-full px-2 text-[15px] font-semibold transition-colors',
                dateType === w.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="mt-5">
          {dateType === 'lastPeriod' && (
            <DateField label="First day of your last period" value={lastPeriodDate} onChange={setLastPeriodDate} disabled={(date) => date > new Date()} />
          )}
          {dateType === 'dueDate' && (
            <DateField label="Due date" value={dueDate} onChange={setDueDate} disabled={(date) => date < new Date()} />
          )}
          {dateType === 'currentWeek' && (
            <>
              <FieldLabel htmlFor="current-week">Week of pregnancy (1 to 42)</FieldLabel>
              <Input
                id="current-week"
                type="number"
                inputMode="numeric"
                min="1"
                max="42"
                placeholder="e.g. 12"
                className={FIELD}
                value={currentWeek}
                onChange={(e) => setCurrentWeek(e.target.value)}
              />
            </>
          )}
        </div>
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      step={3}
      title="Is this your first pregnancy?"
      onBack={onBack}
      primary={{ label: 'Continue', disabled: !isFormValid(), onClick: () => { save(); onFinish(); } }}
    >
      <ChoiceGroup label="Is this your first pregnancy?">
        <Choice title="Yes" selected={firstPregnancy === 'true'} onSelect={() => setFirstPregnancy('true')} />
        <Choice title="No" selected={firstPregnancy === 'false'} onSelect={() => setFirstPregnancy('false')} />
      </ChoiceGroup>
      <div className="mt-7">
        <FieldLabel htmlFor="complications" optional>Anything your doctor is keeping an eye on?</FieldLabel>
        <Textarea
          id="complications"
          placeholder="For example high blood pressure or diabetes"
          className="rounded-[1.25rem] px-4 py-3 text-[16px]"
          value={complications}
          onChange={(e) => setComplications(e.target.value)}
          rows={3}
        />
      </div>
    </OnboardingScreen>
  );
};

export default PregnancyForm;
