import { useState } from 'react';
import { CalendarHeart, Pill, Heart, Microscope } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOnboarding } from '@/contexts/OnboardingContext';
import OnboardingScreen from './OnboardingScreen';
import { Choice, ChoiceGroup, DateField, FIELD, FieldLabel } from './Choice';
import { CYCLE_LENGTHS, type StageFormProps } from './stageForm';
import { onboardingStage } from '@/lib/onboardingFlow';
import { LIFE_STAGE_LABELS } from '@/lib/lifeStageLabels';

// Period tracking. Screen 2: last period + usual length. Screen 3: what
// matters most, which also decides the saved stage (Birth control,
// Trying to conceive, IVF or Period tracking), so each answer shows in
// that stage's colour.
const FOCUS = [
  { value: 'contraception', stage: 'contraception', icon: Pill, title: LIFE_STAGE_LABELS.contraception, description: 'Avoiding pregnancy' },
  { value: 'conception', stage: 'conception', icon: Heart, title: 'Getting pregnant', description: 'Trying to conceive' },
  { value: 'ivf', stage: 'ivf', icon: Microscope, title: 'IVF or fertility treatment', description: 'Having treatment now' },
  { value: 'general', stage: 'menstrual-cycle', icon: CalendarHeart, title: 'General health tracking', description: 'Just tracking my cycle and health' },
] as const;

const RegularCycleForm = ({ part, onNext, onBack, onFinish }: StageFormProps) => {
  const { data, updateRegularCycle } = useOnboarding();

  const [lastPeriodStart, setLastPeriodStart] = useState<Date | undefined>(data.regularCycle?.lastPeriodStart);
  const [cycleLength, setCycleLength] = useState(data.regularCycle?.averageCycleLength || 28);
  const [mainFocus, setMainFocus] = useState(data.regularCycle?.mainFocus || '');

  const firstValid = Boolean(lastPeriodStart && cycleLength);
  const isFormValid = () => Boolean(lastPeriodStart && cycleLength && mainFocus);

  const save = () => updateRegularCycle({ lastPeriodStart, averageCycleLength: cycleLength, mainFocus });

  if (part === 0 || !firstValid) {
    return (
      <OnboardingScreen
        step={2}
        title="When did your last period start?"
        sub="The first day of bleeding. A guess is fine."
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
      title="What matters most right now?"
      onBack={onBack}
      stage={onboardingStage({ lifeStage: data.lifeStage, regularCycle: { lastPeriodStart, averageCycleLength: cycleLength, mainFocus } })}
      primary={{ label: 'Continue', disabled: !isFormValid(), onClick: () => { save(); onFinish(); } }}
    >
      <ChoiceGroup label="Your main focus">
        {FOCUS.map((f) => (
          <Choice
            key={f.value}
            stage={f.stage}
            icon={f.icon}
            title={f.title}
            description={f.description}
            selected={mainFocus === f.value}
            onSelect={() => setMainFocus(f.value)}
          />
        ))}
      </ChoiceGroup>
    </OnboardingScreen>
  );
};

export default RegularCycleForm;
