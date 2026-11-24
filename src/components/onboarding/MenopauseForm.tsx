import { useState } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import OnboardingScreen from './OnboardingScreen';
import { Choice, ChoiceGroup, Chip, DateField, FieldLabel } from './Choice';
import type { StageFormProps } from './stageForm';

// Menopause or after. Screen 2: last period (or "I don't remember").
// Screen 3: on HRT? plus the symptoms that bother her most.
const concernOptions = [
  { id: 'hot-flashes', label: 'Hot flashes' },
  { id: 'night-sweats', label: 'Night sweats' },
  { id: 'mood-changes', label: 'Mood changes' },
  { id: 'sleep-issues', label: 'Sleep' },
  { id: 'weight-changes', label: 'Weight changes' },
  { id: 'bone-health', label: 'Bone health' },
  { id: 'other', label: 'Other' },
];

const MenopauseForm = ({ part, onNext, onBack, onFinish }: StageFormProps) => {
  const { data, updateMenopause } = useOnboarding();

  const [lastPeriod, setLastPeriod] = useState<Date | undefined>(data.menopause?.lastPeriod);
  const [dontRemember, setDontRemember] = useState(data.menopause?.dontRememberLastPeriod || false);
  const [onHRT, setOnHRT] = useState(data.menopause?.onHRT !== undefined ? data.menopause.onHRT.toString() : '');
  const [concerns, setConcerns] = useState<string[]>(data.menopause?.mainConcerns || []);

  const toggleConcern = (concernId: string) => {
    setConcerns((prev) => (prev.includes(concernId) ? prev.filter((c) => c !== concernId) : [...prev, concernId]));
  };

  const firstValid = Boolean(lastPeriod || dontRemember);
  const isFormValid = () => firstValid && onHRT !== '';

  const save = () => updateMenopause({
    lastPeriod: dontRemember ? undefined : lastPeriod,
    dontRememberLastPeriod: dontRemember,
    ...(onHRT !== '' ? { onHRT: onHRT === 'true' } : {}),
    mainConcerns: concerns,
  });

  if (part === 0 || !firstValid) {
    return (
      <OnboardingScreen
        step={2}
        title="When was your last period?"
        sub="Roughly is fine."
        onBack={onBack}
        primary={{ label: 'Continue', disabled: !firstValid, onClick: () => { save(); onNext(); } }}
      >
        {!dontRemember && (
          <DateField label="Last period" value={lastPeriod} onChange={setLastPeriod} disabled={(date) => date > new Date()} />
        )}
        <div className={dontRemember ? '' : 'mt-3'}>
          <ChoiceGroup label="I don't remember" multi>
            <Choice
              multi
              title="I don't remember"
              selected={dontRemember}
              onSelect={() => {
                const next = !dontRemember;
                setDontRemember(next);
                if (next) setLastPeriod(undefined);
              }}
            />
          </ChoiceGroup>
        </div>
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      step={3}
      title="Are you taking HRT?"
      sub="Hormone replacement therapy: tablets, patches, gel or spray."
      onBack={onBack}
      primary={{ label: 'Continue', disabled: !isFormValid(), onClick: () => { save(); onFinish(); } }}
    >
      <ChoiceGroup label="Are you taking HRT?">
        <Choice title="Yes" selected={onHRT === 'true'} onSelect={() => setOnHRT('true')} />
        <Choice title="No" selected={onHRT === 'false'} onSelect={() => setOnHRT('false')} />
      </ChoiceGroup>
      <div className="mt-7">
        <FieldLabel optional>What bothers you most?</FieldLabel>
        <div role="group" aria-label="What bothers you most" className="flex flex-wrap gap-2">
          {concernOptions.map((o) => (
            <Chip key={o.id} selected={concerns.includes(o.id)} onToggle={() => toggleConcern(o.id)}>{o.label}</Chip>
          ))}
        </div>
      </div>
    </OnboardingScreen>
  );
};

export default MenopauseForm;
