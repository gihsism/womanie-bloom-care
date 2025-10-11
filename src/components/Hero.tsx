import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';

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

          {/* Right Visual */}
          <div className="animate-fade-in-delay-1">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-3xl blur-3xl"></div>
              <div className="relative bg-gradient-to-br from-primary/10 to-secondary/10 rounded-3xl p-8 lg:p-12 aspect-square flex items-center justify-center">
                <div className="text-center">
                  <div className="w-32 h-32 lg:w-48 lg:h-48 mx-auto mb-4 bg-gradient-to-br from-primary to-secondary rounded-full opacity-20"></div>
                  <p className="text-muted-foreground">Hero Illustration</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
