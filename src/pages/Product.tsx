import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Activity, Calendar, MessageSquare, FileText, Shield, Zap } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { useAuth } from '@/contexts/AuthContext';

const Product = () => {
  const navigate = useNavigate();
  usePageTitle('Product');
  const { user } = useAuth();

  const features = [
    {
      icon: Activity,
      title: 'Health Tracking',
      description: 'Log your cycle, symptoms, weight and blood pressure, and see how they change month to month.',
    },
    {
      icon: Calendar,
      title: 'Cycle Prediction',
      description: 'Your next period, ovulation and fertile days, worked out from the cycles you have logged.',
    },
    {
      icon: MessageSquare,
      title: 'Ask about your health',
      description: 'Ask a question in your own words. The AI assistant answers with your results and stage in mind.',
    },
    {
      icon: FileText,
      title: 'Medical Records',
      description: 'Your reports, test results and history in one place, ready to show a new doctor.',
    },
    {
      icon: Shield,
      title: 'Private',
      description: 'Your data is encrypted in transit and at rest. A doctor sees it only after you approve them.',
    },
    {
      icon: Zap,
      title: 'Device Integration',
      description: 'On iPhone, bring in sleep, steps and heart rate from Apple Health. More devices are planned.',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section className="py-16 lg:py-24 pt-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              Your cycle, your body, your records
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Womanie tracks the stage you are in, explains your lab reports, and helps you
              prepare for doctor visits.
            </p>
            <Button size="lg" onClick={() => navigate(user ? '/dashboard' : '/auth/select-type')}>
              {user ? 'Go to Dashboard' : 'Create a free account'}
            </Button>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="p-6">
                <feature.icon className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
            How Womanie Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold mb-3">Tell us your stage</h3>
              <p className="text-muted-foreground">
                Create an account and answer a few questions, so Home shows what matters for you now.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-3">Log and upload</h3>
              <p className="text-muted-foreground">
                Log your cycle and symptoms, and add lab reports as you get them.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-3">Understand and act</h3>
              <p className="text-muted-foreground">
                Read what your results mean, ask follow-up questions, and book a doctor when you need one.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Product;
