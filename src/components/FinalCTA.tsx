import { Button } from '@/components/ui/button';
import { Apple, Smartphone } from 'lucide-react';

const FinalCTA = () => {
  return (
    <section className="py-16 lg:py-24 px-4 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
      <div className="container mx-auto max-w-4xl text-center">
        <h2 className="text-3xl lg:text-5xl font-bold mb-6">
          Start Your Health Journey Today
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Join thousands of women taking control of their reproductive health.
          Free to start, no credit card required.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Button size="lg" className="text-lg px-8">
            Get Started Free
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button
            variant="outline"
            size="lg"
            className="bg-background hover:bg-background/80"
          >
            <Apple className="mr-2 h-5 w-5" />
            Download on the App Store
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="bg-background hover:bg-background/80"
          >
            <Smartphone className="mr-2 h-5 w-5" />
            Get it on Google Play
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
