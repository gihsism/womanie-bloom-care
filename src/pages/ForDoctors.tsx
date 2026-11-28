import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { usePublicPageMeta } from '@/hooks/usePublicPageMeta';
import { ArrowRight, FileText, KeyRound, PenLine, Stethoscope } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';

// Marketing page for doctors: one promise, three steps, one button.
// (The old page had 6 feature cards, a 6-item benefit list that repeated
// them, 4 specialty cards and a second call to action.)

const STEPS = [
  {
    icon: KeyRound,
    title: 'The patient shares her records',
    text: 'She gives you a one-time code. You see her data only after she approves, and she can see every time you open her chart.',
  },
  {
    icon: FileText,
    title: 'You see what matters before the visit',
    text: 'Results out of range, her uploaded documents, her cycle or pregnancy tracking, on one screen.',
  },
  {
    icon: PenLine,
    title: 'You write notes and take bookings',
    text: 'Notes can be private or shared with her. Patients book inside the hours you set.',
  },
];

const ForDoctors = () => {
  const navigate = useNavigate();
  usePublicPageMeta('/for-doctors');

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="py-16 lg:py-24 pt-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 mb-6">
              <Stethoscope className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
              <span className="text-xs font-medium text-secondary">For doctors</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-5">
              Your patient's records, <span className="text-secondary">ready before she walks in</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Patients upload their lab reports and track their cycle or pregnancy in Womanie. With her permission, you see it all in one place.
            </p>
            <Button size="lg" className="gap-2 bg-secondary hover:bg-secondary/90" onClick={() => navigate('/auth/doctor-signup')}>
              Register as a doctor
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">
              Already registered?{' '}
              <button type="button" className="text-secondary hover:underline font-medium" onClick={() => navigate('/auth/doctor-login')}>
                Log in
              </button>
            </p>
          </div>

          <h2 className="text-2xl font-bold text-center mb-8">How it works</h2>
          <ol className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Card className="p-6 h-full">
                  <s.icon className="h-8 w-8 text-secondary mb-4" aria-hidden="true" />
                  <h3 className="text-lg font-semibold mb-2">
                    {i + 1}. {s.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ForDoctors;
