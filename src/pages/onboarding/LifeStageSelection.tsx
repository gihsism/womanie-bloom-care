import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Baby, Calendar, Heart, Flower2, Sunset, HeartHandshake } from 'lucide-react';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import OnboardingScreen from '@/components/onboarding/OnboardingScreen';
import { Choice, ChoiceGroup } from '@/components/onboarding/Choice';
import { LIFE_STAGE_DESCRIPTIONS, LIFE_STAGE_LABELS } from '@/lib/lifeStageLabels';
import { ONBOARDING_PATHS } from '@/lib/onboardingFlow';

type OnboardingStage = Exclude<ReturnType<typeof useOnboarding>['data']['lifeStage']['stage'], ''>;

// Screen 1 of 5: which stage. Every answer wears its own stage colour, so
// this is where the colours are introduced; tapping one turns the whole
// screen (and the rest of the flow) into that colour. The saved values
// are the same six as before (Birth control and IVF are picked on the
// next screens of Period tracking).
const lifeStages: { value: OnboardingStage; stage: LifeStage; icon: typeof Calendar; title: string; description: string }[] = [
  { value: 'pre-menstrual', stage: 'pre-menstrual', icon: Flower2, title: LIFE_STAGE_LABELS['pre-menstrual'], description: LIFE_STAGE_DESCRIPTIONS['pre-menstrual'] },
  { value: 'regular-cycle', stage: 'menstrual-cycle', icon: Calendar, title: LIFE_STAGE_LABELS['menstrual-cycle'], description: 'Periods, birth control or IVF' },
  { value: 'trying-to-conceive', stage: 'conception', icon: Heart, title: LIFE_STAGE_LABELS.conception, description: LIFE_STAGE_DESCRIPTIONS.conception },
  { value: 'pregnant', stage: 'pregnancy', icon: Baby, title: LIFE_STAGE_LABELS.pregnancy, description: LIFE_STAGE_DESCRIPTIONS.pregnancy },
  { value: 'postpartum', stage: 'postpartum', icon: HeartHandshake, title: LIFE_STAGE_LABELS.postpartum, description: LIFE_STAGE_DESCRIPTIONS.postpartum },
  { value: 'menopause', stage: 'menopause', icon: Sunset, title: `${LIFE_STAGE_LABELS.menopause} or ${LIFE_STAGE_LABELS['post-menopause'].toLowerCase()}`, description: LIFE_STAGE_DESCRIPTIONS.menopause },
];

const LifeStageSelection = () => {
  usePageTitle('Your stage');
  const navigate = useNavigate();
  const { data, updateLifeStage, setCurrentStep } = useOnboarding();
  const [selectedStage, setSelectedStage] = useState(data.lifeStage.stage);
  const picked = lifeStages.find((s) => s.value === selectedStage);

  const handleContinue = () => {
    if (selectedStage) {
      updateLifeStage(selectedStage);
      setCurrentStep(2);
      navigate(ONBOARDING_PATHS.first);
    }
  };

  return (
    <OnboardingScreen
      step={1}
      title="Where are you right now?"
      sub="Womanie changes with you. You can switch any time in Me."
      onBack={() => navigate('/welcome')}
      stage={picked?.stage ?? null}
      primary={{ label: 'Continue', onClick: handleContinue, disabled: !selectedStage }}
    >
      <ChoiceGroup label="Your life stage">
        {lifeStages.map((s) => (
          <Choice
            key={s.value}
            stage={s.stage}
            icon={s.icon}
            title={s.title}
            description={s.description}
            selected={selectedStage === s.value}
            onSelect={() => setSelectedStage(s.value)}
          />
        ))}
      </ChoiceGroup>
    </OnboardingScreen>
  );
};

export default LifeStageSelection;
