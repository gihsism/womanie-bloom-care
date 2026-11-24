import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ONBOARDING_PATHS } from '@/lib/onboardingFlow';
import RegularCycleForm from '@/components/onboarding/RegularCycleForm';
import TryingToConceiveForm from '@/components/onboarding/TryingToConceiveForm';
import PregnancyForm from '@/components/onboarding/PregnancyForm';
import PreMenstrualForm from '@/components/onboarding/PreMenstrualForm';
import MenopauseForm from '@/components/onboarding/MenopauseForm';
import PostpartumForm from '@/components/onboarding/PostpartumForm';
import type { StageFormProps } from '@/components/onboarding/stageForm';

// Screens 2 and 3 of the first run: the stage's two questions. The part
// is in the URL (?q=2) so the phone's back gesture steps between them.
const ModeSetup = () => {
  usePageTitle('Your stage');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, setCurrentStep } = useOnboarding();
  const part: 0 | 1 = params.get('q') === '2' ? 1 : 0;

  const props: StageFormProps = {
    part,
    onNext: () => navigate(ONBOARDING_PATHS.second),
    onBack: () => {
      if (part === 1) { navigate(ONBOARDING_PATHS.first); return; }
      setCurrentStep(1);
      navigate(ONBOARDING_PATHS.stage);
    },
    onFinish: () => {
      setCurrentStep(4);
      navigate(ONBOARDING_PATHS.about);
    },
  };

  switch (data.lifeStage.stage) {
    case 'regular-cycle':
      return <RegularCycleForm {...props} />;
    case 'trying-to-conceive':
      return <TryingToConceiveForm {...props} />;
    case 'pregnant':
      return <PregnancyForm {...props} />;
    case 'postpartum':
      return <PostpartumForm {...props} />;
    case 'pre-menstrual':
      return <PreMenstrualForm {...props} />;
    case 'menopause':
      return <MenopauseForm {...props} />;
    default:
      // No stage yet (opened directly): start at the stage picker.
      return <Navigate to={ONBOARDING_PATHS.stage} replace />;
  }
};

export default ModeSetup;
