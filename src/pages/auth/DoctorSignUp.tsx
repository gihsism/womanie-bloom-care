import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePublicPageMeta } from '@/hooks/usePublicPageMeta';
import { ArrowLeft, Eye, EyeOff, Mail, Lock, User, Stethoscope, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { scorePassword } from '@/lib/password-strength';

const specialties = [
  'Obstetrics & Gynecology',
  'Reproductive Endocrinology',
  'Maternal-Fetal Medicine',
  'Gynecologic Oncology',
  'Urogynecology',
  'Family Medicine',
  'Internal Medicine',
  'Endocrinology',
  'General Practice',
  'Other'
];

const DoctorSignUp = () => {
  const navigate = useNavigate();
  usePublicPageMeta('/auth/doctor-signup');
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  // One-time invite (/auth/doctor-signup?invite=...): the admin created it
  // for one email, which is pre-filled and locked; the account is approved
  // on signup and lands on the dashboard's setup checklist.
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const [invite, setInvite] = useState<{ email: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    specialty: '',
    licenseNumber: '',
    bio: '',
  });

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    fetch(`/api/auth/doctor-invite?token=${encodeURIComponent(inviteToken)}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && typeof data.email === 'string') {
          setInvite({ email: data.email });
          setFormData(prev => ({ ...prev, email: data.email }));
        } else {
          setInviteError(data.error || 'This invitation link is no longer valid.');
        }
      })
      .catch(() => { if (!cancelled) setInviteError('Could not check the invitation link.'); });
    return () => { cancelled = true; };
  }, [inviteToken]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isStep1Valid = () => {
    return (
      formData.email.length > 0 &&
      formData.password.length >= 8 &&
      formData.password === formData.confirmPassword
    );
  };

  const isStep2Valid = () => {
    return (
      formData.fullName.length > 0 &&
      formData.specialty.length > 0 &&
      formData.licenseNumber.length > 0
    );
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isStep2Valid()) return;

    setIsLoading(true);

    try {
      // Server-side: creates auth_users + unverified doctor_profiles.
      // Intentionally does NOT grant the 'doctor' role or set a
      // session — that's an admin step after verification. We redirect
      // to the login page which will keep the doctor out until then.
      const resp = await fetch('/api/auth/doctor-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          specialty: formData.specialty,
          licenseNumber: formData.licenseNumber,
          bio: formData.bio,
          ...(invite && inviteToken ? { inviteToken } : {}),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast({
          variant: 'destructive',
          title: 'Registration failed',
          description: data.error || 'An unexpected error occurred. Please try again.',
        });
        return;
      }

      if (data.redirect === '/doctor/dashboard') {
        toast({ title: 'Welcome to Womanie', description: 'Your account is ready. A few steps to set up your practice.' });
        // Full reload so AuthContext picks up the new session cookie.
        window.location.href = '/doctor/dashboard';
        return;
      }

      toast({
        title: 'Registration sent',
        description: data.message || 'Your account is pending verification. License review typically takes 1–3 business days; try logging in again once approved.',
      });
      navigate('/auth/doctor-login');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Registration failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
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
          onClick={() => step > 1 ? setStep(step - 1) : navigate('/auth/select-type')}
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
            <h1 className="text-3xl lg:text-4xl font-bold mb-3">Register as a doctor</h1>
            <p className="text-muted-foreground">
              Step {step} of 2 · {step === 1 ? 'Your login' : 'Your licence'}
            </p>
          </div>

          {inviteError && (
            <p role="alert" className="mb-4 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              {inviteError} You can still register below; we then check your licence first.
            </p>
          )}
          <p className="mb-6 text-sm text-muted-foreground flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-secondary shrink-0 mt-0.5" aria-hidden="true" />
            {invite
              ? 'You were invited by Womanie: your account is ready as soon as you register.'
              : 'We check your licence before you can log in (1–3 working days).'}
          </p>

          {/* Form */}
          <form onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2); } : handleSignUp} className="space-y-6">
            {step === 1 && (
              <>
                {/* Email Input */}
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Work email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      className="pl-10"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      readOnly={Boolean(invite)}
                      aria-readonly={Boolean(invite)}
                      required
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters"
                      className="pl-10 pr-10"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-end pr-3 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {formData.password && (() => {
                    const s = scorePassword(formData.password);
                    return (
                      <div className="space-y-1">
                        <div className="flex gap-1" aria-hidden="true">
                          {[1, 2, 3, 4, 5].map((tick) => (
                            <div
                              key={tick}
                              className={`h-1 flex-1 rounded-full ${
                                tick <= s.score ? s.color : 'bg-muted'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-xs flex items-center justify-between" role="status">
                          <span className="font-medium">{s.label}</span>
                          <span className="text-muted-foreground">{s.hint}</span>
                        </p>
                      </div>
                    );
                  })()}
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium">
                    Password again
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      className="pl-10"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      required
                    />
                  </div>
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-sm text-destructive">Passwords do not match</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-secondary hover:bg-secondary/90"
                  disabled={!isStep1Valid()}
                >
                  Continue
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                {/* Full Name */}
                <div className="space-y-2">
                  <label htmlFor="fullName" className="text-sm font-medium">
                    Full name (as on your licence)
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Dr. Jane Smith"
                      className="pl-10"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange('fullName', e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Specialty */}
                <div className="space-y-2">
                  <label htmlFor="specialty" className="text-sm font-medium">
                    Specialty
                  </label>
                  <Select value={formData.specialty} onValueChange={(value) => handleInputChange('specialty', value)}>
                    <SelectTrigger id="specialty">
                      <SelectValue placeholder="Select your specialty" />
                    </SelectTrigger>
                    <SelectContent>
                      {specialties.map((specialty) => (
                        <SelectItem key={specialty} value={specialty}>
                          {specialty}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* License Number */}
                <div className="space-y-2">
                  <label htmlFor="licenseNumber" className="text-sm font-medium">
                    Licence number or GLN
                  </label>
                  <p className="text-xs text-muted-foreground">In Switzerland: your 13-digit GLN from MedReg (starts with 7601).</p>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="licenseNumber"
                      type="text"
                      className="pl-10"
                      value={formData.licenseNumber}
                      onChange={(e) => handleInputChange('licenseNumber', e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Bio */}
                <div className="space-y-2">
                  <label htmlFor="bio" className="text-sm font-medium">
                    Short bio (optional)
                  </label>
                  <Textarea
                    id="bio"
                    placeholder="What patients should know about you"
                    value={formData.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    rows={3}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-secondary hover:bg-secondary/90"
                  disabled={!isStep2Valid() || isLoading}
                >
                  {isLoading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>) : 'Register'}
                </Button>
              </>
            )}

            {/* Bottom Link */}
            <p className="text-center text-sm text-muted-foreground">
              Already registered?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/doctor-login')}
                className="text-secondary hover:underline font-medium"
              >
                Log in
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DoctorSignUp;
