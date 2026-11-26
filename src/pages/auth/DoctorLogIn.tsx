import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useClinicTheme } from '@/hooks/useClinicTheme';
import { ArrowLeft, Eye, EyeOff, Mail, Lock, Stethoscope, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/integrations/db/client';

const DoctorLogIn = () => {
  const navigate = useNavigate();
  usePageTitle('Doctor Login');
  useClinicTheme();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isFormValid = () => {
    return formData.email.length > 0 && formData.password.length > 0;
  };

  const handleLogIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid()) return;

    setIsLoading(true);

    try {
      // Use the real session endpoint — db.auth.signInWithPassword is
      // a Supabase-shim stub that just returns an error.
      const loginResp = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });
      const loginData = await loginResp.json().catch(() => ({}));
      if (!loginResp.ok) {
        toast({
          variant: 'destructive',
          title: 'Login failed',
          description: loginData.error || 'Invalid email or password. Please try again.',
        });
        return;
      }

      // We're logged in as a generic user. Now figure out which of
      // four states this account is in so we can give an accurate
      // error rather than the old "not registered as a doctor"
      // catch-all, which was misleading for anyone whose doctor
      // signup is still awaiting admin verification.
      //
      // /api/db's ownership enforcement injects user_id = session.id
      // on both queries, so we only read this user's own rows.
      const [{ data: roleData }, { data: profileData }] = await Promise.all([
        db
          .from('user_roles')
          .select('role')
          .eq('role', 'doctor')
          .maybeSingle(),
        db
          .from('doctor_profiles')
          .select('verification_status, is_verified')
          .maybeSingle(),
      ]);

      // Happy path: an approved doctor with the role row in place.
      if (roleData && profileData?.is_verified) {
        toast({ title: 'Welcome back' });
        // Full reload so AuthContext picks up the new session cookie
        // before routing into the doctor dashboard.
        window.location.href = '/doctor/dashboard';
        return;
      }

      // Diagnose the four failure modes a doctor can actually be in
      // and surface the right next step. Always clear the session so
      // the user isn't left half-authenticated in the doctor URL.
      const status = profileData?.verification_status as string | undefined;

      let title = 'Not a doctor account';
      let description = 'This account is not registered as a doctor. Log in as a patient, or register as a doctor.';
      if (profileData && (status === 'pending' || !status)) {
        title = 'We are still checking your licence';
        description = 'This takes 1–3 working days. You can log in once it is approved.';
      } else if (profileData && status === 'rejected') {
        title = 'Licence not verified';
        description = 'Email support@womanie.info with updated licence details and we will check again.';
      } else if (profileData && status === 'revoked') {
        title = 'Verification revoked';
        description = 'Email support@womanie.info to discuss reinstating your account.';
      } else if (profileData && profileData.is_verified && !roleData) {
        // Defensive: should be unreachable in normal flows (admin
        // approve always inserts the user_roles row), but if it ever
        // is, the doctor needs a human to fix it.
        title = 'Account out of sync';
        description = 'Your profile shows as verified but the doctor role is missing. Email support@womanie.info — we\'ll fix it manually.';
      }

      toast({ variant: 'destructive', title, description });
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    } catch (error) {
      console.error('Doctor login error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation */}
      <div className="p-4 flex items-center justify-between">
        <button
          onClick={() => navigate('/auth/select-type')}
          className="flex items-center gap-2 min-h-11 text-foreground hover:text-stage-accent"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-[15px] font-medium">Back</span>
        </button>
        <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} className="text-xl font-extrabold text-stage-accent hover:opacity-80 transition-opacity">
          Womanie
        </a>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          {/* Doctor Badge */}
          <div className="flex justify-center mb-6">
            <div className="bg-stage-head p-4 rounded-full">
              <Stethoscope className="h-10 w-10 text-stage-ink" strokeWidth={1.8} aria-hidden="true" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h1 className="page-title text-[2rem] mb-2">Doctor log in</h1>
            <p className="page-sub">See your patients and today's visits</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogIn} className="space-y-5">
            {/* Email Input */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-[15px] font-semibold">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="h-12 rounded-full pl-11 text-[16px]"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[15px] font-semibold">
                  Password
                </label>
                <a
                  className="relative hit-44 text-[14px] font-semibold text-stage-accent hover:underline"
                  href="mailto:support@womanie.info?subject=Password%20reset%20%E2%80%94%20doctor%20account&body=Hi%20Womanie%20team%2C%0A%0AI%20can%27t%20log%20in%20to%20my%20doctor%20account%20and%20need%20a%20password%20reset.%20My%20email%20is%3A%20"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="h-12 rounded-full pl-11 pr-12 text-[16px]"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-11 w-11 rounded-full text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn-stage w-full"
              disabled={!isFormValid() || isLoading}
            >
              {isLoading ? (<><Loader2 className="h-4 w-4 animate-spin" />Logging in…</>) : 'Log in'}
            </button>

            <p className="text-center text-[15px] text-muted-foreground">
              New here?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/doctor-signup')}
                className="relative hit-44 text-stage-accent hover:underline font-semibold"
              >
                Register as a doctor
              </button>
              {' · '}
              <button
                type="button"
                onClick={() => navigate('/auth/login')}
                className="relative hit-44 text-stage-accent hover:underline font-semibold"
              >
                I'm a patient
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DoctorLogIn;
