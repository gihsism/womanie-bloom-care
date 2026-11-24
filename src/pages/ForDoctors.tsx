import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useClinicTheme } from '@/hooks/useClinicTheme';
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
  usePageTitle('For Doctors');
  useClinicTheme();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="pb-16 lg:pb-24 pt-28 lg:pt-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-stage-head mb-6">
              <Stethoscope className="h-4 w-4 text-stage-ink" aria-hidden="true" />
              <span className="text-[13px] font-semibold text-stage-ink">For doctors</span>
            </div>
            <h1 className="text-[2.25rem] lg:text-5xl leading-[1.1] font-extrabold tracking-[-0.02em] mb-5">
              Your patient's records, <span className="text-stage-accent">ready before she walks in</span>
            </h1>
            <p className="text-[17px] lg:text-lg text-muted-foreground mb-8">
              Patients upload their lab reports and track their cycle or pregnancy in Womanie. With her permission, you see it all in one place.
            </p>
            <button type="button" className="btn-stage w-full sm:w-auto" onClick={() => navigate('/auth/doctor-signup')}>
              Register as a doctor
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <p className="mt-4 text-[15px] text-muted-foreground">
              Already registered?{' '}
              <button type="button" className="text-stage-accent hover:underline font-semibold" onClick={() => navigate('/auth/doctor-login')}>
                Log in
              </button>
            </p>
          </div>

          <h2 className="section-title text-center mb-6">How it works</h2>
          <ol className="grid md:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-[1.25rem] bg-stage-tint p-5 md:p-6 h-full">
                <span className="grid place-items-center h-11 w-11 rounded-full bg-background mb-4" aria-hidden="true">
                  <s.icon className="h-5 w-5 text-stage-accent" strokeWidth={1.9} />
                </span>
                <h3 className="text-[17px] font-bold mb-1.5">
                  {i + 1}. {s.title}
                </h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">{s.text}</p>
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
