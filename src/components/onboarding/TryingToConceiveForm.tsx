import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOnboarding } from '@/contexts/OnboardingContext';
import OnboardingScreen from './OnboardingScreen';
import { Choice, ChoiceGroup, Chip, DateField, FIELD, FieldLabel } from './Choice';
import { CYCLE_LENGTHS, type StageFormProps } from './stageForm';

// Trying to conceive. Screen 2: last period + usual length (for the
// fertile window). Screen 3: how long, and any treatment so far.
const DURATIONS = [
  { value: 'just-started', label: 'Just started' },
  { value: '1-3-months', label: '1 to 3 months' },
  { value: '3-6-months', label: '3 to 6 months' },
  { value: '6-12-months', label: '6 to 12 months' },
  { value: 'over-year', label: 'Over a year' },
];

const treatmentOptions = [
  { id: 'none', label: 'None' },
  { id: 'ovulation', label: 'Ovulation tracking' },
  { id: 'medications', label: 'Medications' },
  { id: 'iui', label: 'IUI' },
  { id: 'ivf', label: 'IVF' },
  { id: 'other', label: 'Other' },
];

const TryingToConceiveForm = ({ part, onNext, onBack, onFinish }: StageFormProps) => {
  const { data, updateTryingToConceive } = useOnboarding();

  const [tryingDuration, setTryingDuration] = useState(data.tryingToConceive?.tryingDuration || '');
  const [lastPeriodStart, setLastPeriodStart] = useState<Date | undefined>(data.tryingToConceive?.lastPeriodStart);
  const [cycleLength, setCycleLength] = useState(data.tryingToConceive?.averageCycleLength || 28);
  const [treatments, setTreatments] = useState<string[]>(data.tryingToConceive?.fertilityTreatments || []);

  const toggleTreatment = (treatmentId: string) => {
    setTreatments((prev) => {
      if (treatmentId === 'none') {
        return prev.includes('none') ? [] : ['none'];
      }
      return prev.includes(treatmentId)
        ? prev.filter((t) => t !== treatmentId)
        : [...prev.filter((t) => t !== 'none'), treatmentId];
    });
  };

  const firstValid = Boolean(lastPeriodStart && cycleLength);
  const isFormValid = () => Boolean(tryingDuration && lastPeriodStart && cycleLength);

  const save = () => updateTryingToConceive({
    tryingDuration,
    lastPeriodStart,
    averageCycleLength: cycleLength,
    fertilityTreatments: treatments,
  });

  if (part === 0 || !firstValid) {
    return (
      <OnboardingScreen
        step={2}
        title="When did your last period start?"
        sub="We use it to find your fertile days."
        onBack={onBack}
        primary={{ label: 'Continue', disabled: !firstValid, onClick: () => { save(); onNext(); } }}
      >
        <DateField label="Last period started" value={lastPeriodStart} onChange={setLastPeriodStart} disabled={(date) => date > new Date()} />
        <div className="mt-6">
          <FieldLabel htmlFor="cycle-length">Days from one period to the next, usually</FieldLabel>
          <Select value={cycleLength.toString()} onValueChange={(v) => setCycleLength(Number(v))}>
            <SelectTrigger id="cycle-length" className={FIELD}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CYCLE_LENGTHS.map((day) => (
                <SelectItem key={day} value={day.toString()}>{day} days</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      step={3}
      title="How long have you been trying?"
      onBack={onBack}
      primary={{ label: 'Continue', disabled: !isFormValid(), onClick: () => { save(); onFinish(); } }}
    >
      <ChoiceGroup label="How long have you been trying?">
        {DURATIONS.map((d) => (
          <Choice key={d.value} title={d.label} selected={tryingDuration === d.value} onSelect={() => setTryingDuration(d.value)} />
        ))}
      </ChoiceGroup>
      <div className="mt-7">
        <FieldLabel optional>Any treatment so far?</FieldLabel>
        <div role="group" aria-label="Fertility treatment so far" className="flex flex-wrap gap-2">
          {treatmentOptions.map((o) => (
            <Chip key={o.id} selected={treatments.includes(o.id)} onToggle={() => toggleTreatment(o.id)}>{o.label}</Chip>
          ))}
        </div>
      </div>
    </OnboardingScreen>
  );
};

export default TryingToConceiveForm;
