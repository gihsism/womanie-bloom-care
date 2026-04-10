import { SignUp } from '@clerk/clerk-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArrowLeft } from 'lucide-react';

const PatientSignUp = () => {
  usePageTitle('Sign Up');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 flex items-center justify-between">
        <a href="/auth/select-type" className="flex items-center gap-2 text-foreground hover:text-primary">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Back</span>
        </a>
        <a href="/" className="text-xl font-bold text-primary hover:opacity-80 transition-opacity">
          Womanie
        </a>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <SignUp
          routing="hash"
          afterSignUpUrl="/welcome"
          appearance={{
            elements: {
              rootBox: 'w-full max-w-md',
              card: 'shadow-none border border-border',
            },
          }}
        />
      </div>
    </div>
  );
};

export default PatientSignUp;
