import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useClinicTheme } from '@/hooks/useClinicTheme';
import { ArrowLeft, Eye, EyeOff, Mail, Lock, User, Stethoscope, FileText, AlertCircle, Loader2 } from 'lucide-react';
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
  usePageTitle('Doctor Sign Up');
  useClinicTheme();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    specialty: '',
    licenseNumber: '',
    bio: '',
  });

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

      toast({
        title: 'Registration submitted!',
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
            <h1 className="page-title text-[2rem] mb-2">Register as a doctor</h1>
            <p className="page-sub">
              Step {step} of 2 · {step === 1 ? 'Your login' : 'Your licence'}
            </p>
          </div>

          <p className="mb-6 rounded-[1.25rem] bg-stage-tint px-4 py-3 text-[15px] flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 text-stage-accent shrink-0 mt-px" aria-hidden="true" />
            We check your licence before you can log in (1–3 working days).
          </p>

          {/* Form */}
          <form onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2); } : handleSignUp} className="space-y-5">
            {step === 1 && (
              <>
                {/* Email Input */}
                <div className="space-y-2">
                  <label htmlFor="email" className="text-[15px] font-semibold">
                    Work email
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
                  <label htmlFor="password" className="text-[15px] font-semibold">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters"
                      className="h-12 rounded-full pl-11 pr-12 text-[16px]"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      required
                      minLength={8}
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
                  <label htmlFor="confirmPassword" className="text-[15px] font-semibold">
                    Password again
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      className="h-12 rounded-full pl-11 text-[16px]"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      required
                    />
                  </div>
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-sm text-destructive">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn-stage w-full"
                  disabled={!isStep1Valid()}
                >
                  Continue
                </button>
              </>
            )}

            {step === 2 && (
              <>
                {/* Full Name */}
                <div className="space-y-2">
                  <label htmlFor="fullName" className="text-[15px] font-semibold">
                    Full name (as on your licence)
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Dr. Jane Smith"
                      className="h-12 rounded-full pl-11 text-[16px]"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange('fullName', e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Specialty */}
                <div className="space-y-2">
                  <label htmlFor="specialty" className="text-[15px] font-semibold">
                    Specialty
                  </label>
                  <Select value={formData.specialty} onValueChange={(value) => handleInputChange('specialty', value)}>
                    <SelectTrigger id="specialty" className="h-12 rounded-full px-4 text-[16px]">
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
                  <label htmlFor="licenseNumber" className="text-[15px] font-semibold">
                    Licence number
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="licenseNumber"
                      type="text"
                      className="h-12 rounded-full pl-11 text-[16px]"
                      value={formData.licenseNumber}
                      onChange={(e) => handleInputChange('licenseNumber', e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Bio */}
                <div className="space-y-2">
                  <label htmlFor="bio" className="text-[15px] font-semibold">
                    Short bio (optional)
                  </label>
                  <Textarea
                    id="bio"
                    placeholder="What patients should know about you"
                    value={formData.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    rows={3}
                    className="rounded-2xl text-[16px]"
                  />
                </div>

                <button
                  type="submit"
                  className="btn-stage w-full"
                  disabled={!isStep2Valid() || isLoading}
                >
                  {isLoading ? (<><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>) : 'Register'}
                </button>
              </>
            )}

            {/* Bottom Link */}
            <p className="text-center text-[15px] text-muted-foreground">
              Already registered?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/doctor-login')}
                className="text-stage-accent hover:underline font-semibold"
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
