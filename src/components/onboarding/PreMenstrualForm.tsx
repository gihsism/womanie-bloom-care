import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useOnboarding } from '@/contexts/OnboardingContext';
import OnboardingScreen from './OnboardingScreen';
import { FIELD, FieldLabel } from './Choice';
import type { StageFormProps } from './stageForm';

// Before first period. Screen 2: age (and a parent's email under 18).
// Screen 3: any health conditions (optional).
const PreMenstrualForm = ({ part, onNext, onBack, onFinish }: StageFormProps) => {
  const { data, updatePreMenstrual } = useOnboarding();

  const [age, setAge] = useState<string | number>(data.preMenstrual?.age || '');
  const [healthConditions, setHealthConditions] = useState(data.preMenstrual?.healthConditions || '');
  const [guardianEmail, setGuardianEmail] = useState(data.preMenstrual?.guardianEmail || '');

  const isFormValid = () => {
    if (!age || Number(age) < 8 || Number(age) > 18) return false;
    if (Number(age) < 18 && !guardianEmail) return false;
    return true;
  };

  const save = () => updatePreMenstrual({ age: Number(age), healthConditions, guardianEmail });

  if (part === 0 || !isFormValid()) {
    return (
      <OnboardingScreen
        step={2}
        title="How old are you?"
        onBack={onBack}
        primary={{ label: 'Continue', disabled: !isFormValid(), onClick: () => { save(); onNext(); } }}
      >
        <FieldLabel htmlFor="age">Your age (8 to 18)</FieldLabel>
        <Input
          id="age"
          type="number"
          inputMode="numeric"
          min="8"
          max="18"
          placeholder="Your age"
          className={FIELD}
          value={age}
          onChange={(e) => setAge(e.target.value)}
        />
        {age && Number(age) < 18 && (
          <div className="mt-6">
            <FieldLabel htmlFor="guardian-email">Your parent's or guardian's email</FieldLabel>
            <Input
              id="guardian-email"
              type="email"
              autoComplete="off"
              placeholder="parent@example.com"
              className={FIELD}
              value={guardianEmail}
              onChange={(e) => setGuardianEmail(e.target.value)}
            />
            <p className="mt-2 text-[14px] text-muted-foreground">We send them a short note about your account.</p>
          </div>
        )}
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      step={3}
      title="Anything about your health we should know?"
      sub="For example asthma, or a medicine you take. You can leave this empty."
      onBack={onBack}
      primary={{ label: 'Continue', onClick: () => { save(); onFinish(); } }}
    >
      <FieldLabel htmlFor="conditions" optional>Health conditions</FieldLabel>
      <Textarea
        id="conditions"
        placeholder="Write it in your own words"
        className="rounded-[1.25rem] px-4 py-3 text-[16px]"
        value={healthConditions}
        onChange={(e) => setHealthConditions(e.target.value)}
        rows={4}
      />
    </OnboardingScreen>
  );
};

export default PreMenstrualForm;
