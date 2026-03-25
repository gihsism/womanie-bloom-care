import { useNavigate } from 'react-router-dom';
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
              <span className="text-xs font-medium text-primary">AI-Powered Health Analysis</span>
            </div>

            <h1 className="text-4xl lg:text-6xl font-bold leading-tight mb-5">
              Understand Your Health{' '}
              <span className="text-primary">Like Never Before</span>
            </h1>
            <p className="text-lg lg:text-xl text-muted-foreground mb-6">
              Upload your lab results and medical documents — our AI explains every result
              in plain language, spots patterns your doctor might miss, and tracks your
              health across pregnancy, cycles, fertility, and menopause.
            </p>

            {/* Key benefits */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-8 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                Upload any medical document
              </span>
              <span className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" aria-hidden="true" />
                AI explains every result
              </span>
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
                100% private & encrypted
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
                  Get Started Free
                  <ArrowRight className="h-5 w-5" />
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8"
                onClick={() => navigate('/product')}
              >
                See How It Works
              </Button>
            </div>
          </div>

          {/* Right Visual */}
          <div className="animate-fade-in-delay-1 flex items-center justify-center">
            <div className="relative max-w-md lg:max-w-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-3xl blur-3xl"></div>
              <img
                src={heroIllustration}
                alt="Woman holding smartphone with health tracking dashboard"
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
