import { useState } from 'react';
import { differenceInDays } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';
import OnboardingScreen from './OnboardingScreen';
import { Chip, DateField } from './Choice';
import type { StageFormProps } from './stageForm';

// After birth. Screen 2: the baby's birth date (required: recovery
// milestones are timed from it, up to two years back). Screen 3: what
// she'd like help with (optional).
const concernOptions = [
  { id: 'lochia', label: 'Bleeding after birth' },
  { id: 'feeding', label: 'Feeding' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'mood', label: 'Mood' },
  { id: 'pelvic-floor', label: 'Pelvic floor or scar' },
  { id: 'returning-work', label: 'Going back to work' },
];

const PostpartumForm = ({ part, onNext, onBack, onFinish }: StageFormProps) => {
  const { data, updatePostpartum } = useOnboarding();

  const [birthDate, setBirthDate] = useState<Date | undefined>(data.postpartum?.birthDate ? new Date(data.postpartum.birthDate) : undefined);
  const [concerns, setConcerns] = useState<string[]>(data.postpartum?.mainConcerns || []);

  const toggleConcern = (id: string) => {
    setConcerns((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const isFormValid = () => {
    if (!birthDate) return false;
    const days = differenceInDays(new Date(), birthDate);
    return days >= 0 && days <= 730;
  };

  const save = () => { if (birthDate) updatePostpartum({ birthDate, mainConcerns: concerns }); };

  if (part === 0 || !isFormValid()) {
    const days = birthDate ? differenceInDays(new Date(), birthDate) : null;
    return (
      <OnboardingScreen
        step={2}
        title="When was your baby born?"
        sub="Recovery tips follow your baby's age."
        onBack={onBack}
        primary={{ label: 'Continue', disabled: !isFormValid(), onClick: () => { save(); onNext(); } }}
      >
        <DateField label="Baby's birth date" value={birthDate} onChange={setBirthDate} disabled={(date) => date > new Date()} />
        {days !== null && (
          <p className="mt-3 text-[15px] text-muted-foreground" role="status">
            {days > 730
              ? 'That is more than two years ago. Pick a date in the last two years.'
              : days === 0 ? 'Born today. Congratulations!' : `Your baby is ${days} ${days === 1 ? 'day' : 'days'} old.`}
          </p>
        )}
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      step={3}
      title="What would you like help with?"
      sub="Pick any, or none."
      onBack={onBack}
      primary={{ label: 'Continue', disabled: !isFormValid(), onClick: () => { save(); onFinish(); } }}
    >
      <div role="group" aria-label="What would you like help with" className="flex flex-wrap gap-2">
        {concernOptions.map((o) => (
          <Chip key={o.id} selected={concerns.includes(o.id)} onToggle={() => toggleConcern(o.id)}>{o.label}</Chip>
        ))}
      </div>
    </OnboardingScreen>
  );
};

export default PostpartumForm;
