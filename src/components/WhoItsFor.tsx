import { useNavigate } from 'react-router-dom';
import { Pill, Baby, HeartPulse, Microscope, Flame } from 'lucide-react';

const WhoItsFor = () => {
  const navigate = useNavigate();

  const journeys = [
    {
      icon: Pill,
      title: 'Contraception',
      description:
        'A daily pill reminder, a pack tracker and a place to note side effects to bring up with your doctor.',
      stage: 'contraception',
    },
    {
      icon: Baby,
      title: 'Conception',
      description:
        'See your likely fertile days from your cycle, temperature and ovulation tests, and log each try.',
      stage: 'conception',
    },
    {
      icon: HeartPulse,
      title: 'Pregnancy',
      description:
        'What is happening in your body and in the baby, week by week, with the tests that are usually due.',
      stage: 'pregnancy',
    },
    {
      icon: Microscope,
      title: 'IVF',
      description:
        'Enter the dates from your clinic once. See which phase you are in, what is next and when the trigger shot is due.',
      stage: 'ivf',
    },
    {
      icon: Flame,
      title: 'Menopause',
      description:
        'Log hot flushes, sleep and mood, and follow hormone, bone and heart markers from your blood tests.',
      stage: 'menopause',
    },
  ];

  return (
    <section className="py-16 lg:py-24 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            Whatever stage you are in
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Pick your stage and the app shows what matters now. Change it whenever life changes.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {journeys.map((journey, index) => (
            <button
              key={index}
              onClick={() => navigate('/auth/select-type')}
              className="bg-gradient-to-br from-background to-muted/50 rounded-2xl p-6 border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 group text-left"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <journey.icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{journey.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {journey.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhoItsFor;
