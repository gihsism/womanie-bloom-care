import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { IconRows, PublicHero, PublicSection } from '@/components/public/PublicUI';
import {
  Heart, BookOpen, Baby, Flower2, Sparkles, Instagram, Facebook, Globe,
  Pill, Activity, Stethoscope, Lightbulb, Shield, ChevronRight,
} from 'lucide-react';

const supportGroups = [
  {
    title: 'Periods and cycles',
    description: 'Connect with others navigating menstrual health, irregular cycles, and hormonal balance.',
    icon: Activity,
    stage: 'menstrual-cycle' as const,
    members: 'Coming soon',
  },
  {
    title: 'Trying to conceive',
    description: 'Share your fertility journey, tips, and emotional support with women on the same path.',
    icon: Heart,
    stage: 'conception' as const,
    members: 'Coming soon',
  },
  {
    title: 'Pregnancy circle',
    description: 'Week-by-week discussions, bump updates, and a safe space for expecting mothers.',
    icon: Baby,
    stage: 'pregnancy' as const,
    members: 'Coming soon',
  },
  {
    title: 'IVF warriors',
    description: 'A supportive community for those going through IVF — sharing experiences, wins, and struggles.',
    icon: Sparkles,
    stage: 'ivf' as const,
    members: 'Coming soon',
  },
  {
    title: 'Menopause and beyond',
    description: 'Embrace this new chapter with advice, symptom management tips, and peer support.',
    icon: Flower2,
    stage: 'menopause' as const,
    members: 'Coming soon',
  },
  {
    title: 'Birth control choices',
    description: 'Discuss options, side effects, and personal experiences with different contraception methods.',
    icon: Pill,
    stage: 'contraception' as const,
    members: 'Coming soon',
  },
];

const resources = [
  {
    title: 'Expert articles',
    description: 'Doctor-reviewed guides on hormones, fertility, pregnancy, and menopause.',
    icon: BookOpen,
    tag: 'Coming soon',
  },
  {
    title: 'Ask a doctor',
    description: 'Submit health questions anonymously and get answers from verified professionals.',
    icon: Stethoscope,
    tag: 'Coming soon',
  },
  {
    title: 'Wellness tips',
    description: 'Nutrition, exercise, and mental health advice tailored to your life stage.',
    icon: Lightbulb,
    tag: 'Coming soon',
  },
  {
    title: 'Safety and privacy',
    description: 'All discussions are moderated and your health data is never shared.',
    icon: Shield,
    tag: 'Always',
  },
];

const socialLinks = [
  {
    platform: 'Instagram',
    icon: Instagram,
    handle: '@womanie.health',
    url: 'https://instagram.com/womanie.health',
    description: 'Daily tips, infographics and community stories',
  },
  {
    platform: 'Facebook Group',
    icon: Facebook,
    handle: 'Womanie Community',
    url: 'https://facebook.com/groups/womanie',
    description: 'Join our private group for deeper discussions',
  },
  {
    platform: 'Website & Blog',
    icon: Globe,
    handle: 'Womanie blog',
    url: '/blog',
    description: 'In-depth articles and health guides',
  },
];

const Tag = ({ children }: { children: string }) => (
  <span className="ml-2 align-middle rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-semibold text-muted-foreground">{children}</span>
);

const Community = () => {
  usePageTitle('Community');
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <PublicHero
          title="You're never alone on this journey"
          sub="Womanie Community is a safe, supportive space where women connect, share experiences and help each other through every stage of health and life."
          cta={{ label: 'Join Womanie', onClick: () => { window.location.href = '/auth/select-type'; } }}
        >
          <p className="mt-3 text-[15px] text-muted-foreground">
            The community is launching soon. Sign up and you'll be the first to know when it opens.
          </p>
        </PublicHero>

        <PublicSection title="Support groups by life stage" sub="Groups for exactly where you are right now.">
          <IconRows
            items={supportGroups.map((g) => ({
              icon: g.icon,
              stage: g.stage,
              title: <>{g.title}<Tag>{g.members}</Tag></>,
              description: g.description,
            }))}
          />
        </PublicSection>

        <PublicSection title="Questions and answers" sub="Ask questions, share what you know and learn from other women. Moderated for safety.">
          <div className="panel px-5 py-6">
            <h3 className="text-[17px] font-bold">The forum opens soon</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
              A safe space, moderated by doctors, where you can ask anything, from "Is this normal?" to
              "What worked for you?" No judgement, just support. We'll let you know when it opens.
            </p>
          </div>
        </PublicSection>

        <PublicSection title="Resources" sub="Health content reviewed by medical professionals, because you deserve reliable information.">
          <IconRows items={resources.map((r) => ({ icon: r.icon, title: <>{r.title}<Tag>{r.tag}</Tag></>, description: r.description }))} />
        </PublicSection>

        <PublicSection title="Connect with us today" sub="While we finish the community in the app, find us here." className="pb-16">
          <div className="row-group">
            {socialLinks.map((social) => {
              const Icon = social.icon;
              const external = social.url.startsWith('http');
              return (
                <a
                  key={social.platform}
                  href={social.url}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-3.5 px-4 py-4 hover:bg-muted/60"
                >
                  <span className="grid place-items-center h-11 w-11 shrink-0 rounded-full bg-stage-tint text-stage-accent" aria-hidden="true">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[16px] font-bold">{social.platform} <span className="font-semibold text-stage-accent">{social.handle}</span></span>
                    <span className="block text-[14px] text-muted-foreground">{social.description}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </a>
              );
            })}
          </div>
        </PublicSection>
      </main>
      <Footer />
    </div>
  );
};

export default Community;
