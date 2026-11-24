import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Check } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { PublicHero, PublicSection } from '@/components/public/PublicUI';
import { useAuth } from '@/contexts/AuthContext';

const Pricing = () => {
  const navigate = useNavigate();
  usePageTitle('Pricing');
  const { user } = useAuth();

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      description: 'The basics, free for good',
      features: [
        'Menstrual cycle tracking',
        'Basic symptom logging',
        'Cycle predictions',
        'AI health assistant (limited)',
        'Community access',
        'Educational resources',
      ],
      cta: 'Get started',
      popular: false,
    },
    {
      name: 'Premium',
      price: '$9.99',
      period: 'a month',
      description: 'Everything Womanie can tell you about your health',
      features: [
        'Everything in Free',
        'Unlimited AI health assistant',
        'Advanced analytics & trends',
        'Fertility & ovulation tracking',
        'Symptom analysis',
        'Device integration',
        'Export health reports',
        'Priority support',
      ],
      cta: 'Start free trial',
      popular: true,
    },
    {
      name: 'Professional',
      price: '$24.99',
      period: 'a month',
      description: 'For doctors and clinics caring for patients',
      features: [
        'Everything in Premium',
        'Patient management dashboard',
        'Telemedicine consultations',
        'Digital health records',
        'Appointment scheduling',
        'Encrypted health data',
        'Team collaboration',
        'Dedicated account manager',
      ],
      cta: 'Email us',
      popular: false,
    },
  ];

  const faqs = [
    { q: 'Can I switch plans at any time?', a: "Yes. You can upgrade or downgrade at any time. Changes take effect straight away and we prorate any charges." },
    { q: 'Is there a free trial?', a: 'Premium comes with a 14-day free trial. No credit card needed to start, and you can cancel any time before the trial ends.' },
    { q: 'How can I pay?', a: 'All major credit cards (Visa, Mastercard, American Express), PayPal and Apple Pay.' },
    { q: 'Is my data secure?', a: 'Yes. Your health data is encrypted in transit and at rest, you decide exactly what is shared with whom, and you can export or delete it at any time. It is never shared with third parties.' },
  ];

  // The professional plan is for clinics: its button opens an email to
  // us (it used to say "Contact sales" but went to the sign-up page).
  const choose = (plan: (typeof plans)[number]) => {
    if (plan.name === 'Professional') {
      window.location.href = 'mailto:support@womanie.info?subject=Womanie%20Professional';
      return;
    }
    navigate(user ? '/dashboard' : '/auth/select-type');
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <PublicHero title="Simple, clear pricing" sub="Start free. Always know what you'll pay." />

        <section className="px-4 pb-10">
          <div className="mx-auto max-w-5xl grid md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div key={plan.name} className={`panel p-6 flex flex-col ${plan.popular ? 'border-stage-accent ring-1 ring-stage-accent' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="section-title">{plan.name}</h2>
                  {plan.popular && <span className="rounded-full bg-stage-tint px-3 py-1 text-[13px] font-bold text-stage-accent">Most popular</span>}
                </div>
                <p className="mt-3">
                  <span className="text-[2.25rem] font-extrabold tracking-tight">{plan.price}</span>
                  <span className="text-[15px] text-muted-foreground"> {plan.period}</span>
                </p>
                <p className="mt-1 text-[15px] text-muted-foreground">{plan.description}</p>
                <ul className="mt-5 mb-6 space-y-2.5 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5 items-start text-[15px]">
                      <Check className="h-5 w-5 text-stage-accent shrink-0" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.popular ? (
                  <button type="button" className="btn-stage w-full" onClick={() => choose(plan)}>
                    {user ? 'Go to Home' : plan.cta}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full min-h-12 rounded-full border border-input px-5 text-[16px] font-semibold hover:bg-muted/60"
                    onClick={() => choose(plan)}
                  >
                    {plan.name === 'Professional' ? plan.cta : user ? 'Go to Home' : plan.cta}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <PublicSection title="Questions" className="pb-16">
          <div className="row-group">
            {faqs.map((f) => (
              <div key={f.q} className="px-4 py-4">
                <h3 className="text-[16px] font-bold">{f.q}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </div>
        </PublicSection>
      </main>
      <Footer />
    </div>
  );
};

export default Pricing;
