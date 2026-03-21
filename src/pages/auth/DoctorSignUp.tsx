import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Mail, Lock, User, Stethoscope, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
      formData.password.length >= 6 &&
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
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        // Add doctor role
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role: 'doctor',
          });

        // Note: This may fail due to RLS but we have a trigger for this
        if (roleError) {
          console.log('Role insert handled by system');
        }

        // Create doctor profile
        const { error: profileError } = await supabase
          .from('doctor_profiles')
          .insert({
            user_id: authData.user.id,
            full_name: formData.fullName,
            specialty: formData.specialty,
            license_number: formData.licenseNumber,
            bio: formData.bio,
            verification_status: 'pending',
          });

        if (profileError) throw profileError;

        toast({
          title: 'Registration submitted!',
          description: 'Your account is pending verification. You will be notified once approved.',
        });
        navigate('/auth/doctor-login');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Registration failed',
        description: error.message || 'An unexpected error occurred. Please try again.',
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
        <a href="/" className="text-xl font-bold text-primary hover:opacity-80 transition-opacity">
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
            <h1 className="text-3xl lg:text-4xl font-bold mb-3">Doctor Registration</h1>
            <p className="text-muted-foreground">Join our network of healthcare professionals</p>
          </div>

          {/* Progress Steps */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}>
                1
              </div>
              <div className={`w-12 h-1 ${step >= 2 ? 'bg-secondary' : 'bg-muted'}`} />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}>
                2
              </div>
            </div>
          </div>

          {/* Verification Notice */}
          <Card className="mb-6 border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-secondary">Verification Required</p>
                <p className="text-muted-foreground">All doctor registrations require license verification before access is granted.</p>
              </div>
            </CardContent>
          </Card>

          {/* Form */}
          <form onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2); } : handleSignUp} className="space-y-6">
            {step === 1 && (
              <>
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
                      placeholder="Enter your professional email"
                      className="pl-10"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
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
                      placeholder="Create a password (min 6 characters)"
                      className="pl-10 pr-10"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
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
                    Full Name (as on license)
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
                    Medical Specialty
                  </label>
                  <Select value={formData.specialty} onValueChange={(value) => handleInputChange('specialty', value)}>
                    <SelectTrigger>
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
                    Medical License Number
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="licenseNumber"
                      type="text"
                      placeholder="Enter your license number"
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
                    Professional Bio (optional)
                  </label>
                  <Textarea
                    id="bio"
                    placeholder="Brief description of your expertise and experience..."
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
                  {isLoading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>) : 'Submit for Verification'}
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
                Log In
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DoctorSignUp;
