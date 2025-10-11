import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, Target, Users, Award, Shield } from 'lucide-react';

const About = () => {
  const navigate = useNavigate();

  const values = [
    {
      icon: Heart,
      title: 'Empathy First',
      description: 'We understand the unique challenges women face and design our platform with compassion and care.',
    },
    {
      icon: Shield,
      title: 'Privacy & Security',
      description: 'Your health data is sacred. We use bank-level encryption and never share your information.',
    },
    {
      icon: Users,
      title: 'Community Driven',
      description: 'We listen to our users and continuously improve based on your feedback and needs.',
    },
    {
      icon: Award,
      title: 'Evidence-Based',
      description: 'All our health information is reviewed by medical professionals and backed by research.',
    },
  ];

  const stats = [
    { number: '500K+', label: 'Active Users' },
    { number: '1M+', label: 'Cycles Tracked' },
    { number: '2K+', label: 'Healthcare Providers' },
    { number: '98%', label: 'Satisfaction Rate' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>

      {/* Hero Section */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              Empowering Women Through Technology
            </h1>
            <p className="text-xl text-muted-foreground">
              Womanie was born from a simple belief: every woman deserves access to personalized,
              comprehensive healthcare that understands her unique journey.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {stats.map((stat) => (
              <Card key={stat.label} className="p-6 text-center">
                <div className="text-3xl lg:text-4xl font-bold text-primary mb-2">{stat.number}</div>
                <div className="text-muted-foreground">{stat.label}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-bold mb-8">Our Story</h2>
            <div className="space-y-4 text-lg text-muted-foreground">
              <p>
                Founded in 2023, Womanie emerged from the personal experiences of our founding team—women who
                struggled to find comprehensive, accessible healthcare solutions that truly understood their needs.
              </p>
              <p>
                We noticed a gap in the market: while there were plenty of period trackers, fertility apps, and
                pregnancy monitors, there wasn't a unified platform that supported women through every stage of
                their health journey—from adolescence through menopause and beyond.
              </p>
              <p>
                Today, Womanie combines cutting-edge AI technology with expert medical care and a supportive
                community to provide truly personalized health insights. We're proud to serve over 500,000 women
                worldwide and partner with thousands of healthcare providers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">Our Values</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => (
              <Card key={value.title} className="p-6 text-center">
                <value.icon className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-3">{value.title}</h3>
                <p className="text-muted-foreground">{value.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Target className="h-16 w-16 text-primary mx-auto mb-6" />
            <h2 className="text-3xl lg:text-4xl font-bold mb-6">Our Mission</h2>
            <p className="text-xl text-muted-foreground">
              To democratize access to personalized women's healthcare by combining AI technology,
              medical expertise, and community support—making quality health insights and care
              available to every woman, everywhere.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
