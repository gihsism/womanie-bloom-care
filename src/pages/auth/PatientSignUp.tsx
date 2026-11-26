import { useState, useEffect } from 'react';
import { isNativeApp } from '@/lib/platform';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, EyeOff, Mail, Lock, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import AuthLayout, { AUTH_ICON, AUTH_INPUT, GoogleButton, OrDivider } from '@/components/auth/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { scorePassword } from '@/lib/password-strength';
import { ONBOARDING_PATHS } from '@/lib/onboardingFlow';

const PatientSignUp = () => {
  usePageTitle('Sign Up');
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const strength = scorePassword(password);

  useEffect(() => {
    if (!loading && user) navigate(ONBOARDING_PATHS.stage, { replace: true });
  }, [user, loading, navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (password.length < 8) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Must be at least 8 characters' });
      return;
    }
    setIsLoading(true);

    try {
      const resp = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
        credentials: 'include',
      });
      const data = await resp.json();

      if (!resp.ok) {
        toast({ variant: 'destructive', title: 'Sign up failed', description: data.error });
        return;
      }

      // Straight to screen 1 of 5 (the stage picker): five screens from
      // sign-up to a Home set up for her. Welcome stays one tap away
      // (Back on the stage picker, "See what I can do first" at the end).
      window.location.href = ONBOARDING_PATHS.stage;
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Something went wrong' });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-stage-accent" />
      </div>
    );
  }

  return (
    <AuthLayout backHref="/auth/select-type" title="Create your account" sub="Free. Your health in one place.">
      {!isNativeApp() && (
        <>
          <GoogleButton />
          <OrDivider label="or with email" />
        </>
      )}

      <form onSubmit={handleSignUp} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="name" className="text-[15px] font-semibold">Your name</label>
          <div className="relative">
            <User className={AUTH_ICON} aria-hidden="true" />
            <Input id="name" type="text" autoComplete="name" placeholder="First and last name" className={AUTH_INPUT} value={name} onChange={e => setName(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className="text-[15px] font-semibold">Email</label>
          <div className="relative">
            <Mail className={AUTH_ICON} aria-hidden="true" />
            <Input id="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" placeholder="your@email.com" className={AUTH_INPUT} value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-[15px] font-semibold">Password</label>
          <div className="relative">
            <Lock className={AUTH_ICON} aria-hidden="true" />
            <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" className={`${AUTH_INPUT} pr-12`} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-11 w-11 rounded-full text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {password && (
            <div className="space-y-1.5 pt-1">
              <div className="flex gap-1" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((tick) => (
                  <div key={tick} className={`h-1.5 flex-1 rounded-full ${tick <= strength.score ? strength.color : 'bg-line'}`} />
                ))}
              </div>
              <p className="text-[14px] flex items-center justify-between gap-3" role="status">
                <span className="font-semibold">{strength.label}</span>
                <span className="text-muted-foreground text-right">{strength.hint}</span>
              </p>
            </div>
          )}
        </div>
        <button type="submit" className="btn-stage w-full" disabled={isLoading}>
          {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Creating your account…</> : 'Create account'}
        </button>
      </form>

      <p className="mt-8 text-center text-[15px] text-muted-foreground">
        Have an account? <a href="/auth/login" className="font-semibold text-stage-accent underline underline-offset-2">Log in</a>
        {' · '}
        <a href="/auth/doctor-signup" className="font-semibold text-stage-accent underline underline-offset-2">I'm a doctor</a>
      </p>
    </AuthLayout>
  );
};

export default PatientSignUp;
