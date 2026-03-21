import { Heart, FileText, Brain, TrendingUp, Shield } from 'lucide-react';
import { Card } from '@/components/ui/card';

const highlights = [
  {
    icon: FileText,
    title: 'AI Document Analysis',
    description: 'Upload lab results and get instant, plain-language explanations of every test — what it means, whether it\'s healthy, and what to do next.',
  },
  {
    icon: Brain,
    title: 'Personalized Insights',
    description: 'Our AI cross-references your results to find patterns that matter — like how your iron levels connect to your cycle, or what your hormones mean for fertility.',
  },
  {
    icon: TrendingUp,
    title: 'Trend Predictions',
    description: 'Track how your health changes over time with visual charts, comparisons, and predictions for where your values are heading.',
  },
  {
    icon: Shield,
    title: 'Private & Secure',
    description: 'Your health data is encrypted and visible only to you. We never share, sell, or use your data for anything other than helping you.',
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
            Built for Real Women's Health
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Womanie goes beyond basic tracking. We analyze your medical documents, explain results in plain language, and give you insights your doctor would approve of.
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
