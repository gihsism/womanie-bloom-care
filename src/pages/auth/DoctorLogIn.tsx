import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArrowLeft, Eye, EyeOff, Mail, Lock, Stethoscope, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/integrations/db/client';

const DoctorLogIn = () => {
  const navigate = useNavigate();
  usePageTitle('Doctor Login');
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
        toast({
          title: 'Welcome back, Doctor!',
          description: 'You have successfully logged in.',
        });
        // Full reload so AuthContext picks up the new session cookie
        // before routing into the doctor dashboard.
        window.location.href = '/doctor/dashboard';
        return;
      }

      // Diagnose the four failure modes a doctor can actually be in
      // and surface the right next step. Always clear the session so
      // the user isn't left half-authenticated in the doctor URL.
      const status = profileData?.verification_status as string | undefined;

      let title = 'Access denied';
      let description = 'This account is not registered as a doctor. Use patient login, or register as a doctor.';
      if (profileData && (status === 'pending' || !status)) {
        title = 'Verification pending';
        description = 'Your doctor signup is in the queue for admin review. License verification typically takes 1–3 business days. Try logging in again once you\'ve been approved.';
      } else if (profileData && status === 'rejected') {
        title = 'Verification not approved';
        description = 'We weren\'t able to verify the credentials on file. Email support@womanie.info with updated license details and we\'ll re-review.';
      } else if (profileData && status === 'revoked') {
        title = 'Verification revoked';
        description = 'Your doctor verification has been revoked. Email support@womanie.info to discuss reinstating.';
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
          className="flex items-center gap-2 text-foreground hover:text-primary"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Back</span>
        </button>
        <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} className="text-xl font-bold text-primary hover:opacity-80 transition-opacity">
          Womanie
        </a>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          {/* Doctor Badge */}
          <div className="flex justify-center mb-6">
            <div className="bg-secondary/10 p-4 rounded-full">
              <Stethoscope className="h-12 w-12 text-secondary" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h1 className="text-3xl lg:text-4xl font-bold mb-3">Doctor Portal</h1>
            <p className="text-muted-foreground">Log in to access your professional dashboard</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogIn} className="space-y-6">
            {/* Email Input */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Professional Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  className="pl-10"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <a
                  className="text-sm text-primary hover:underline"
                  href="mailto:support@womanie.info?subject=Password%20reset%20%E2%80%94%20doctor%20account&body=Hi%20Womanie%20team%2C%0A%0AI%20can%27t%20log%20in%20to%20my%20doctor%20account%20and%20need%20a%20password%20reset.%20My%20email%20is%3A%20"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="pl-10 pr-10"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-secondary hover:bg-secondary/90"
              disabled={!isFormValid() || isLoading}
            >
              {isLoading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Logging in...</>) : 'Log In as Doctor'}
            </Button>

            {/* Bottom Link */}
            <p className="text-center text-sm text-muted-foreground">
              Not registered as a doctor?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/doctor-signup')}
                className="text-secondary hover:underline font-medium"
              >
                Register Now
              </button>
            </p>

            <p className="text-center text-sm text-muted-foreground">
              Are you a patient?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/login')}
                className="text-primary hover:underline font-medium"
              >
                Patient Login
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DoctorLogIn;
