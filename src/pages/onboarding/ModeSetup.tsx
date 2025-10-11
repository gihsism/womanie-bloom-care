import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import ProgressBar from '@/components/onboarding/ProgressBar';
import RegularCycleForm from '@/components/onboarding/RegularCycleForm';
import TryingToConceiveForm from '@/components/onboarding/TryingToConceiveForm';
import PregnancyForm from '@/components/onboarding/PregnancyForm';
import PreMenstrualForm from '@/components/onboarding/PreMenstrualForm';
import MenopauseForm from '@/components/onboarding/MenopauseForm';

const ModeSetup = () => {
  const navigate = useNavigate();
  const { data, setCurrentStep } = useOnboarding();

  const handleBack = () => {
    setCurrentStep(2);
    navigate('/onboarding/life-stage');
  };

  const renderForm = () => {
    switch (data.lifeStage.stage) {
      case 'regular-cycle':
        return <RegularCycleForm />;
      case 'trying-to-conceive':
        return <TryingToConceiveForm />;
      case 'pregnant':
        return <PregnancyForm />;
      case 'pre-menstrual':
        return <PreMenstrualForm />;
      case 'menopause':
        return <MenopauseForm />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-4 py-8">
      <div className="mb-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Back</span>
        </button>
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
