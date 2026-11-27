import { useNavigate } from 'react-router-dom';
import { startLogin } from '@/lib/login';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText, Brain, Shield } from 'lucide-react';
import heroIllustration from '@/assets/hero-illustration.png';
import { useAuth } from '@/contexts/AuthContext';

const Hero = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <section className="pt-28 pb-16 lg:pt-36 lg:pb-28 px-4">
      <div className="container mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Brain className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="text-xs font-medium text-primary">Reads lab reports in English, German and French</span>
            </div>

            <h1 className="text-4xl lg:text-6xl font-bold leading-tight mb-5">
              Know what your lab results{' '}
              <span className="text-primary">actually say</span>
            </h1>
            <p className="text-lg lg:text-xl text-muted-foreground mb-6">
              Upload a lab report or a doctor's letter. Each value is explained in plain
              words, next to your earlier results. The app follows your cycle, pregnancy,
              fertility treatment or menopause, and changes with you.
            </p>

            {/* Key benefits */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-8 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                PDF, photo or Word file
              </span>
              <span className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" aria-hidden="true" />
                Every value explained
              </span>
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
                Encrypted, never sold
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {user ? (
                <Button
                  size="lg"
                  className="text-lg px-8 gap-2"
                  onClick={() => navigate('/dashboard')}
                >
                  Go to Dashboard
                  <ArrowRight className="h-5 w-5" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="text-lg px-8 gap-2"
                  onClick={() => navigate('/auth/select-type')}
                >
                  Create a free account
                  <ArrowRight className="h-5 w-5" />
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8"
                onClick={() => navigate('/product')}
              >
                See what it does
              </Button>
            </div>
            {!user && (
              <p className="text-[15px] text-muted-foreground">
                Already have an account?{' '}
                <button type="button" onClick={() => startLogin(navigate)} className="font-medium text-primary underline underline-offset-4">
                  Log in
                </button>
              </p>
            )}
          </div>

          {/* Right Visual */}
          <div className="animate-fade-in-delay-1 flex items-center justify-center">
            <div className="relative max-w-md lg:max-w-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-3xl blur-3xl"></div>
              <img
                src={heroIllustration}
                alt="Woman looking at the Womanie app on her phone"
                className="relative w-full h-auto rounded-3xl"
                width={512}
                height={512}
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
