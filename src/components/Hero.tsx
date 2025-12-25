import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import heroIllustration from '@/assets/hero-illustration.png';

const Hero = () => {
  const navigate = useNavigate();

  return (
    <section className="pt-32 pb-20 lg:pt-40 lg:pb-32 px-4">
      <div className="container mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="animate-fade-in">
            <h1 className="text-4xl lg:text-6xl font-bold leading-tight mb-6">
              Your Complete{' '}
              <span className="text-primary">Women's Health</span> Companion
            </h1>
            <p className="text-lg lg:text-xl text-muted-foreground mb-8">
              Personalized health tracking that adapts to every stage of your
              reproductive journey - from first period through menopause
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="text-lg px-8"
                onClick={() => navigate('/auth/select-type')}
              >
                Get Started Free
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8">
                <Play className="mr-2 h-5 w-5" />
                See How It Works
              </Button>
            </div>
          </div>

          {/* Right Visual - Hero Illustration */}
          <div className="animate-fade-in-delay-1">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-3xl blur-3xl"></div>
              <img 
                src={heroIllustration} 
                alt="Woman in meditation pose surrounded by flowers - women's health illustration" 
                className="relative w-full h-auto rounded-3xl"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
