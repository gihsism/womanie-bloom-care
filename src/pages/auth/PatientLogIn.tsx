import { useState, useEffect } from 'react';
import { isNativeApp } from '@/lib/platform';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Loader2, Eye, EyeOff, Mail, Lock } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import Logo from '@/components/brand/Logo';

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
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 flex items-center justify-between">
        <a href="/auth/select-type" className="flex items-center gap-2 text-foreground hover:text-primary">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Back</span>
        </a>
        <a href="/" className="text-xl hover:opacity-80 transition-opacity">
          <Logo />
        </a>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Welcome Back</h1>
            <p className="text-muted-foreground">Log in to your health dashboard</p>
          </div>

          {googleOnlyError && showGoogle && (
            <div role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm"><b className="font-medium">{email.trim() || 'This account'}</b> signs in with Google — there is no Womanie password to type.</p>
              <GoogleButton />
            </div>
          )}

          {leadWithGoogle && !googleOnlyError && (
            <div className="space-y-2">
              <GoogleButton />
              <p className="text-center text-xs text-muted-foreground">You signed in with Google last time{email ? ` (${email})` : ''}.</p>
            </div>
          )}

          {leadWithGoogle && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or use a password</span></div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" placeholder="your@email.com" className="pl-10" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a
                  href="mailto:support@womanie.info?subject=Password%20reset&body=Hi%20Womanie%20team%2C%0A%0AI%20can%27t%20log%20in%20and%20need%20a%20password%20reset.%20My%20email%20is%3A%20"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" autoFocus={Boolean(email) && !leadWithGoogle} placeholder="Enter password" className="pl-10 pr-10" value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-end pr-3 text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Logging in...</> : 'Log In'}
            </Button>
          </form>

          {showGoogle && !leadWithGoogle && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
              </div>
  
              <GoogleButton />
            </>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account? <a href="/auth/signup" className="text-primary underline underline-offset-2 font-medium">Sign Up</a>
          </p>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Are you a doctor? <a href="/auth/doctor-login" className="text-primary underline underline-offset-2">Doctor login</a>
          </p>
        </Card>
      </div>
    </div>
  );
};

function GoogleButton() {
  return (
    <Button variant="outline" size="lg" className="w-full gap-3" onClick={() => { window.location.href = '/api/auth/google'; }}>
      <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Continue with Google
    </Button>
  );
}

export default PatientLogIn;
