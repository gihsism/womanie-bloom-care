import { useState, useEffect } from 'react';
import { isNativeApp } from '@/lib/platform';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import AuthLayout, { AUTH_ICON, AUTH_INPUT, GoogleButton, OrDivider } from '@/components/auth/AuthLayout';
import { useToast } from '@/hooks/use-toast';

const PatientLogIn = () => {
  usePageTitle('Log In');
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  // Pre-fill the last email used on this device (saved by AuthContext / on login).
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('womanie_last_email') ?? ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Accounts created with Google have no password. Remember that on this
  // device so the page leads with Google instead of letting the phone
  // autofill an old saved password that can never work.
  const [googleFirst, setGoogleFirst] = useState(() => { try { return localStorage.getItem('womanie_last_method') === 'google'; } catch { return false; } });
  const [googleOnlyError, setGoogleOnlyError] = useState(false);
  const showGoogle = !isNativeApp();
  const leadWithGoogle = showGoogle && googleFirst;

  useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true });
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await resp.json();

      if (!resp.ok) {
        if (resp.status === 401 && /google/i.test(String(data.error ?? ''))) {
          // No password on this account: point at the Google button instead of a red error.
          setGoogleOnlyError(true);
          setGoogleFirst(true);
          setPassword('');
          try { localStorage.setItem('womanie_last_method', 'google'); localStorage.setItem('womanie_last_email', email.trim()); } catch { /* storage blocked */ }
          return;
        }
        toast({ variant: 'destructive', title: 'Login failed', description: data.error });
        return;
      }

      try { localStorage.setItem('womanie_last_email', email.trim()); localStorage.setItem('womanie_last_method', 'password'); } catch { /* storage blocked */ }
      window.location.href = '/dashboard';
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
    <AuthLayout backHref="/auth/select-type" title="Welcome back" sub="Log in to see your health in one place">
      {googleOnlyError && showGoogle && (
        <div role="status" className="panel bg-stage-tint border-stage-accent/30 p-4 space-y-3 mb-6">
          <p className="text-[15px]"><b className="font-semibold">{email.trim() || 'This account'}</b> signs in with Google — there is no Womanie password to type.</p>
          <GoogleButton />
        </div>
      )}

      {leadWithGoogle && !googleOnlyError && (
        <div className="space-y-2">
          <GoogleButton />
          <p className="text-center text-[14px] text-muted-foreground">You signed in with Google last time{email ? ` (${email})` : ''}.</p>
        </div>
      )}

      {leadWithGoogle && <OrDivider label="or use a password" />}

      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="email" className="text-[15px] font-semibold">Email</label>
          <div className="relative">
            <Mail className={AUTH_ICON} aria-hidden="true" />
            <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" placeholder="your@email.com" className={AUTH_INPUT} value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[15px] font-semibold">Password</label>
            <a
              href="mailto:support@womanie.info?subject=Password%20reset&body=Hi%20Womanie%20team%2C%0A%0AI%20can%27t%20log%20in%20and%20need%20a%20password%20reset.%20My%20email%20is%3A%20"
              className="text-[14px] font-semibold text-stage-accent hover:underline"
            >
              Forgot password?
            </a>
          </div>
          <div className="relative">
            <Lock className={AUTH_ICON} aria-hidden="true" />
            <Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" autoFocus={Boolean(email) && !leadWithGoogle} placeholder="Your password" className={`${AUTH_INPUT} pr-12`} value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-10 w-10 rounded-full text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <button type="submit" className="btn-stage w-full" disabled={isLoading}>
          {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Logging in…</> : 'Log in'}
        </button>
      </form>

      {showGoogle && !leadWithGoogle && (
        <>
          <OrDivider />
          <GoogleButton />
        </>
      )}

      <p className="mt-8 text-center text-[15px] text-muted-foreground">
        New here? <a href="/auth/signup" className="font-semibold text-stage-accent hover:underline">Create an account</a>
        {' · '}
        <a href="/auth/doctor-login" className="font-semibold text-stage-accent hover:underline">I'm a doctor</a>
      </p>
    </AuthLayout>
  );
};

export default PatientLogIn;
