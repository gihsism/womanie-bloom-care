import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Activity, Calendar, MessageSquare, FileText, Shield, Zap } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';

const Product = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Activity,
      title: 'Health Tracking',
      description: 'Monitor your menstrual cycle, symptoms, and overall health metrics with advanced AI-powered analytics.',
    },
    {
      icon: Calendar,
      title: 'Cycle Prediction',
      description: 'Get accurate predictions for your next period, ovulation, and fertile window based on your unique patterns.',
    },
    {
      icon: MessageSquare,
      title: 'AI Health Assistant',
      description: 'Chat with our AI assistant for instant health advice, symptom checking, and personalized recommendations.',
    },
    {
      icon: FileText,
      title: 'Medical Records',
      description: 'Store and manage all your health documents, test results, and medical history securely in one place.',
    },
    {
      icon: Shield,
      title: 'Privacy First',
      description: 'Your health data is encrypted and protected with bank-level security. You control who sees your information.',
    },
    {
      icon: Zap,
      title: 'Device Integration',
      description: 'Connect your smartwatch and fitness trackers to automatically sync health data and insights.',
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
              Your Complete Women's Health Platform
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Womanie combines AI-powered insights, expert medical care, and community support
              to help you take control of your health journey.
            </p>
            <Button size="lg" onClick={() => navigate('/auth/select-type')}>
              Get Started Free
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
              <h3 className="text-xl font-semibold mb-3">Sign Up & Personalize</h3>
              <p className="text-muted-foreground">
                Create your account and complete your health profile to get personalized insights.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-3">Track & Monitor</h3>
              <p className="text-muted-foreground">
                Log your symptoms, cycle, and connect your devices for automatic health tracking.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-3">Get Insights & Care</h3>
              <p className="text-muted-foreground">
                Receive AI-powered insights, consult with doctors, and join our supportive community.
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
