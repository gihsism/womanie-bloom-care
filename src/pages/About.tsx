import { useNavigate } from 'react-router-dom';
import { Heart, Users, Award, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { IconRows, PublicHero, PublicSection } from '@/components/public/PublicUI';
import alenaPhoto from '@/assets/alena-photo.png';
import marinaPhoto from '@/assets/marina-photo.jpg';
import johnPhoto from '@/assets/john-photo.png';
import { usePageTitle } from '@/hooks/usePageTitle';

const About = () => {
  usePageTitle('About');
  const navigate = useNavigate();
  const { user } = useAuth();

  const values = [
    {
      icon: Heart,
      title: 'Empathy first',
      description: 'We understand the unique challenges women face and design our platform with compassion and care.',
    },
    {
      icon: Shield,
      title: 'Privacy and security',
      description: 'Your health data is sacred. We encrypt it and never share your information.',
    },
    {
      icon: Users,
      title: 'Led by our community',
      description: 'We listen to our users and continuously improve based on your feedback and needs.',
    },
    {
      icon: Award,
      title: 'Based on evidence',
      description: 'All our health information is reviewed by medical professionals and backed by research.',
    },
  ];

  const stats = [
    { number: '8', label: 'life stages supported' },
    { number: '40+', label: 'pregnancy weeks followed' },
    { number: '4', label: 'AI models to choose from' },
    { number: '100%', label: 'of your data encrypted' },
  ];

  const story = [
    "Womanie was born from deeply personal experiences. Our founders—a patient who spent years navigating the complexities of women's healthcare, a gynecologist who walked the same fertility journey with her patients, and a tech entrepreneur who saw the gap between healthcare and technology.",
    "We noticed a gap in the market: while there were plenty of period trackers, fertility apps, and pregnancy monitors, there wasn't a unified platform that supported women through every step of their medical experience—whether it's finding the right doctor, navigating fertility treatments, starting their sexual life and choosing contraception, managing menopause, or handling any health concern in between.",
    "Today, Womanie combines cutting-edge AI technology with expert medical care and a supportive community to provide truly personalized health insights. We're finalizing our platform and can't wait to welcome women worldwide very soon.",
  ];

  const founders = [
    { name: 'Alena', role: 'CEO & Co-Founder', photo: alenaPhoto, bio: "Former Senior Manager at a Big-4 firm, ACCA qualified and experienced in audit and technical accounting. After years navigating gynecologists, urologists, and fertility clinics across multiple countries—facing miscarriages, operations, unexplained diagnoses, repeating her story, and losing documents—Alena's painful journey became the catalyst for building Womanie." },
    { name: 'Marina', role: 'CMO & Co-Founder', photo: marinaPhoto, bio: "Practicing gynecologist in Zurich with over 15 years of experience, having helped hundreds of women through their health journeys. Marina's understanding of women's health is both professional and personal—she went through her own fertility challenges before successfully giving birth to her baby boy. She ensures every feature is medically sound and truly helpful." },
    { name: 'John', role: 'CTO & Co-Founder', photo: johnPhoto, bio: "Serial entrepreneur bridging IT and healthcare, with an impressive track record spanning Roche, Oxford University, NHS, and businesses across the globe. John brings world-class technical expertise and a deep understanding of healthcare systems to build technology that truly serves patients and providers alike." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <PublicHero
          title="Better health care for women, with technology"
          sub="Womanie was born from a simple belief: every woman deserves care that is personal, complete and understands where she is in life."
        />

        <section className="px-4 pb-4">
          <dl className="mx-auto max-w-3xl grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="panel px-4 py-4">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-[1.75rem] font-extrabold text-stage-accent leading-none">{stat.number}</dd>
                <dd className="mt-1.5 text-[14px] leading-snug text-muted-foreground" aria-hidden="true">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <PublicSection title="Our story">
          <div className="space-y-4 text-[17px] leading-relaxed text-muted-foreground">
            {story.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
          </div>
        </PublicSection>

        <PublicSection
          title="Meet the founders"
          sub="Three people with one mission: better health care for women through technology, empathy and medical expertise."
        >
          <div className="row-group">
            {founders.map((f) => (
              <div key={f.name} className="flex gap-4 px-4 py-5">
                <img src={f.photo} alt={`${f.name}, ${f.role}`} className="h-16 w-16 shrink-0 rounded-full object-cover object-top" />
                <div className="min-w-0">
                  <h3 className="text-[17px] font-bold leading-tight">{f.name}</h3>
                  <p className="text-[14px] font-semibold text-stage-accent">{f.role}</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{f.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </PublicSection>

        <PublicSection title="Our values">
          <IconRows items={values} />
        </PublicSection>

        <PublicSection title="Our mission" className="pb-16">
          <p className="text-[17px] leading-relaxed text-muted-foreground">
            To make personal women's health care available to every woman, everywhere, by bringing
            together AI, medical expertise and community support.
          </p>
          <button type="button" className="btn-stage mt-6 w-full sm:w-auto sm:px-8" onClick={() => navigate(user ? '/dashboard' : '/auth/select-type')}>
            {user ? 'Go to Home' : 'Get started free'}
          </button>
        </PublicSection>
      </main>
      <Footer />
    </div>
  );
};

export default About;
