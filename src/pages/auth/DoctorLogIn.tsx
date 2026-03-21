import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Eye, EyeOff, Mail, Lock, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const DoctorLogIn = () => {
  const navigate = useNavigate();
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
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Login failed',
          description: error.message === 'Invalid login credentials' 
            ? 'Invalid email or password. Please try again.' 
            : error.message,
        });
        return;
      }

      // Check if user has doctor role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authData.user?.id)
        .eq('role', 'doctor')
        .maybeSingle();

      if (!roleData) {
        toast({
          variant: 'destructive',
          title: 'Access denied',
          description: 'This account is not registered as a doctor. Please use patient login or register as a doctor.',
        });
        await supabase.auth.signOut();
        return;
      }

      toast({
        title: 'Welcome back, Doctor!',
        description: 'You have successfully logged in.',
      });
      navigate('/doctor/dashboard');
    } catch (error) {
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
                  href="#"
                  className="text-sm text-primary hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    toast({ title: 'Coming soon', description: 'Password reset will be available soon' });
                  }}
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
              {isLoading ? 'Logging in...' : 'Log In as Doctor'}
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
