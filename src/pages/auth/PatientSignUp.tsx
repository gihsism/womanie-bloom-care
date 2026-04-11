import { SignIn } from '@clerk/clerk-react';
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
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Create Your Account</h1>
          <p className="text-muted-foreground">Sign in with Google to get started — your account is created automatically.</p>
          <SignIn
            afterSignInUrl="/welcome"
            signInUrl="/auth/signup"
            appearance={{
              elements: {
                rootBox: 'w-full max-w-md',
                card: 'shadow-none border border-border',
              },
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default PatientSignUp;
