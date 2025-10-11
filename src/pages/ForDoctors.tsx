import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Calendar, FileText, BarChart, Shield, Clock } from 'lucide-react';

const ForDoctors = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Users,
      title: 'Patient Management',
      description: 'Manage all your patients in one place with comprehensive health profiles and history.',
    },
    {
      icon: Calendar,
      title: 'Smart Scheduling',
      description: 'Automated appointment booking, reminders, and calendar integration to optimize your time.',
    },
    {
      icon: FileText,
      title: 'Digital Health Records',
      description: 'Access patient records, test results, and tracking data securely from anywhere.',
    },
    {
      icon: BarChart,
      title: 'Data Insights',
      description: 'View patient health trends, cycle patterns, and symptoms visualized in easy-to-read charts.',
    },
    {
      icon: Shield,
      title: 'HIPAA Compliant',
      description: 'Enterprise-grade security and full compliance with healthcare data protection regulations.',
    },
    {
      icon: Clock,
      title: 'Telemedicine Ready',
      description: 'Conduct secure video consultations and chat with patients remotely.',
    },
  ];

  const benefits = [
    'Expand your practice reach with telemedicine',
    'Reduce administrative burden with automated tools',
    'Improve patient outcomes with continuous monitoring',
    'Access comprehensive patient data in real-time',
    'Streamline communication with patients',
    'Get paid faster with integrated billing',
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
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              Empower Your Practice with Womanie
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Join hundreds of healthcare providers using Womanie to deliver better care,
              reach more patients, and grow their practice.
            </p>
            <div className="flex gap-4 justify-center">
              <Button size="lg">Join as a Doctor</Button>
              <Button size="lg" variant="outline">Schedule a Demo</Button>
            </div>
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

      {/* Why Choose Womanie */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              Why Healthcare Providers Choose Womanie
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg">{benefit}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Specializations */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
            Perfect for Multiple Specializations
          </h2>
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <Card className="p-6 text-center">
              <h3 className="font-semibold mb-2">Gynecologists</h3>
              <p className="text-sm text-muted-foreground">Comprehensive women's health care</p>
            </Card>
            <Card className="p-6 text-center">
              <h3 className="font-semibold mb-2">Obstetricians</h3>
              <p className="text-sm text-muted-foreground">Pregnancy and prenatal care</p>
            </Card>
            <Card className="p-6 text-center">
              <h3 className="font-semibold mb-2">Fertility Specialists</h3>
              <p className="text-sm text-muted-foreground">Conception and fertility treatment</p>
            </Card>
            <Card className="p-6 text-center">
              <h3 className="font-semibold mb-2">Endocrinologists</h3>
              <p className="text-sm text-muted-foreground">Hormonal health management</p>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ForDoctors;
