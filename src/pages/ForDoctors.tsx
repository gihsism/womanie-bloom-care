import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Users, Calendar, FileText, BarChart, Shield, Clock, Stethoscope, ArrowRight, CheckCircle2 } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';

const ForDoctors = () => {
  const navigate = useNavigate();
  usePageTitle('For Doctors');

  const features = [
    { icon: Users, title: 'Patient Dashboard', description: 'See all your connected patients, their health data, uploaded documents, and AI-generated insights in one place.' },
    { icon: FileText, title: 'AI-Analyzed Records', description: 'Your patients\' lab results are automatically analyzed — you see extracted values, trends, and flagged abnormalities.' },
    { icon: Calendar, title: 'Appointment Booking', description: 'Patients book directly into your schedule. Set your hours, consultation duration, and pricing.' },
    { icon: BarChart, title: 'Health Trends', description: 'Visual charts showing how patient values change over time — spot patterns across multiple visits.' },
    { icon: Shield, title: 'Secure & Compliant', description: 'Bank-level encryption, role-based access control. Patients approve your access to their data.' },
    { icon: Clock, title: 'Clinical Notes', description: 'Add clinical observations, diagnoses, and follow-up notes. Control which notes the patient can see.' },
  ];

  const benefits = [
    'Access patient lab results and AI analysis before the appointment',
    'See trends across multiple visits in visual charts',
    'Patients share documents and daily health logs with you',
    'Write clinical notes with visibility control',
    'Set your own schedule and consultation pricing',
    'Patients find you through the doctor directory',
  ];

  const specialties = [
    { emoji: '👩‍⚕️', title: 'Gynecologists', desc: 'Cycle data, hormone levels, screening results' },
    { emoji: '🤰', title: 'Obstetricians', desc: 'Prenatal tests, pregnancy tracking, due dates' },
    { emoji: '🔬', title: 'Fertility Specialists', desc: 'AMH, FSH, IVF timelines, hormone monitoring' },
    { emoji: '🧬', title: 'Endocrinologists', desc: 'Thyroid panels, hormonal profiles, metabolic data' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero */}
      <section className="py-16 lg:py-24 pt-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 mb-6">
              <Stethoscope className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
              <span className="text-xs font-medium text-secondary">For Healthcare Providers</span>
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              Your Patients' Health Data,{' '}
              <span className="text-secondary">AI-Organized</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Patients upload their documents — AI extracts and organizes everything. You see trends, flagged results, and clinical context before the appointment even starts.
            </p>
            <Button size="lg" className="gap-2 bg-secondary hover:bg-secondary/90" onClick={() => navigate('/auth/doctor-signup')}>
              Join as a Doctor
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <Card key={f.title} className="p-6 hover:shadow-md transition-shadow">
                <f.icon className="h-10 w-10 text-secondary mb-4" aria-hidden="true" />
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
            Why Doctors Use Womanie
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {benefits.map((b) => (
              <div key={b} className="flex gap-3 items-start p-3 rounded-lg hover:bg-background transition-colors">
                <CheckCircle2 className="h-5 w-5 text-secondary flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Specializations */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Built for Your Specialty</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Womanie surfaces the data that matters most for your specialty
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {specialties.map(s => (
              <Card key={s.title} className="p-5 text-center hover:shadow-md transition-shadow">
                <span className="text-3xl mb-3 block">{s.emoji}</span>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </Card>
            ))}
          </div>
          <div className="text-center mt-12">
            <Button size="lg" variant="outline" className="gap-2" onClick={() => navigate('/auth/doctor-signup')}>
              Create Your Doctor Profile
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ForDoctors;
