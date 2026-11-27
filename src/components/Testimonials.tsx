import { Heart, FileText, Brain, TrendingUp, Shield } from 'lucide-react';
import { Card } from '@/components/ui/card';

const highlights = [
  {
    icon: FileText,
    title: 'Reports explained',
    description: 'Each test on your report in plain words: what it measures, whether it is in range, and what to ask your doctor.',
  },
  {
    icon: Brain,
    title: 'Results read together',
    description: 'Values are read side by side, so low ferritin is linked to heavy periods, or AMH to your fertility plans.',
  },
  {
    icon: TrendingUp,
    title: 'Changes over time',
    description: 'Each value charted across all your tests, so you can see whether it is rising, falling or steady.',
  },
  {
    icon: Shield,
    title: 'Yours alone',
    description: 'Your data is encrypted and only you can see it, unless you share it with a doctor. We never sell it.',
  },
];

const Testimonials = () => {
  return (
    <section className="py-16 lg:py-24 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Heart className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            More than a period tracker
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Womanie also reads your medical paperwork and explains it, so you walk into appointments knowing what your numbers mean.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {highlights.map((item) => (
            <Card key={item.title} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1.5">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
