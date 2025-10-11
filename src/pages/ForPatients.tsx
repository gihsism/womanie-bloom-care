import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Heart, Users, BookOpen, Calendar, MessageCircle, TrendingUp } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';

const ForPatients = () => {
  const navigate = useNavigate();

  const benefits = [
    {
      icon: Heart,
      title: 'Personalized Health Tracking',
      description: 'Track your menstrual cycle, symptoms, mood, and overall wellness with tools designed specifically for women.',
    },
    {
      icon: MessageCircle,
      title: '24/7 AI Health Assistant',
      description: 'Get instant answers to your health questions, symptom analysis, and personalized recommendations anytime.',
    },
    {
      icon: Calendar,
      title: 'Chat with a Doctor',
      description: 'Get support from specialized gynecologists, fertility experts, and women\'s health professionals anytime.',
    },
    {
      icon: Users,
      title: 'Supportive Community',
      description: 'Connect with other women going through similar health journeys in our private, moderated groups.',
    },
    {
      icon: BookOpen,
      title: 'Health Education',
      description: 'Access evidence-based articles, guides, and resources about women\'s health written by medical experts.',
    },
    {
      icon: TrendingUp,
      title: 'Progress Insights',
      description: 'Visualize your health trends over time with beautiful charts and receive actionable insights.',
    },
  ];

  const testimonials = [
    {
      name: 'Sarah M.',
      condition: 'PCOS Management',
      quote: 'Womanie helped me understand my PCOS symptoms better. The tracking features and AI insights have been life-changing.',
    },
    {
      name: 'Emma K.',
      condition: 'Pregnancy Journey',
      quote: 'From conception to delivery, Womanie was my trusted companion. The community support was incredible.',
    },
    {
      name: 'Lisa R.',
      condition: 'Menopause Support',
      quote: 'Finally, a platform that understands menopause. The symptom tracking and doctor consultations made this transition easier.',
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
              Your Health, Your Way
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Whether you're tracking your cycle, planning pregnancy, managing menopause, or just want to stay healthy,
              Womanie is here to support every stage of your journey.
            </p>
            <Button size="lg" onClick={() => navigate('/auth/select-type')}>
              Start Your Journey
            </Button>
          </div>

          {/* Benefits Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="p-6">
                <benefit.icon className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">{benefit.title}</h3>
                <p className="text-muted-foreground">{benefit.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* What You Can Track */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
            What You Can Track
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Physical Health</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Menstrual cycle and period flow</li>
                <li>• Ovulation and fertility window</li>
                <li>• Symptoms and pain levels</li>
                <li>• Medication and supplements</li>
                <li>• Sleep patterns and quality</li>
                <li>• Weight and body measurements</li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Mental & Emotional</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Mood and energy levels</li>
                <li>• Stress and anxiety patterns</li>
                <li>• Sexual wellness</li>
                <li>• Skin and hair health</li>
                <li>• Cravings and appetite</li>
                <li>• Overall wellness score</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
            Stories from Our Community
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.name} className="p-6">
                <div className="mb-4">
                  <div className="font-semibold text-lg">{testimonial.name}</div>
                  <div className="text-sm text-primary">{testimonial.condition}</div>
                </div>
                <p className="text-muted-foreground italic">"{testimonial.quote}"</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ForPatients;
