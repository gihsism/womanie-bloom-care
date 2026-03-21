import { Heart, Sparkles } from 'lucide-react';

const Testimonials = () => {
  return (
    <section className="py-16 lg:py-24 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Heart className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            Something Beautiful Is Coming
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            We're putting the finishing touches on Womanie — fine-tuning our AI document analysis, 
            polishing every detail, and making sure everything is just right for you. ✨
          </p>
          <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-full px-5 py-2.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Launching soon — stay tuned!</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
