import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import ProgressBar from '@/components/onboarding/ProgressBar';
import RegularCycleForm from '@/components/onboarding/RegularCycleForm';
import TryingToConceiveForm from '@/components/onboarding/TryingToConceiveForm';
import PregnancyForm from '@/components/onboarding/PregnancyForm';
import MenopauseForm from '@/components/onboarding/MenopauseForm';
import PostpartumForm from '@/components/onboarding/PostpartumForm';

const ModeSetup = () => {
  const navigate = useNavigate();
  const { data, setCurrentStep } = useOnboarding();

  // Nothing to ask for these stages (or no stage yet): don't show an empty step.
  const stage = data.lifeStage.stage;
  const hasForm = ['regular-cycle', 'contraception', 'trying-to-conceive', 'pregnant', 'postpartum', 'menopause'].includes(stage);
  useEffect(() => {
    if (!hasForm) navigate(stage ? '/onboarding/success' : '/onboarding/life-stage', { replace: true });
  }, [hasForm, stage, navigate]);

  const handleBack = () => {
    setCurrentStep(2);
    navigate('/onboarding/life-stage');
  };

  const renderForm = () => {
    switch (data.lifeStage.stage) {
      case 'regular-cycle':
        return <RegularCycleForm />;
      case 'contraception':
        return <RegularCycleForm contraception />;
      case 'trying-to-conceive':
        return <TryingToConceiveForm />;
      case 'pregnant':
        return <PregnancyForm />;
      case 'postpartum':
        return <PostpartumForm />;
      case 'menopause':
        return <MenopauseForm />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Back</span>
        </button>
        <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} className="text-xl font-bold text-primary hover:opacity-80 transition-opacity">
          Womanie
        </a>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-2xl">
          <ProgressBar currentStep={3} totalSteps={3} />
          {renderForm()}
        </div>
      </div>
    </div>
  );
};

export default ModeSetup;
