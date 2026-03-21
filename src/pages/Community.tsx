import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Heart, Users, MessageCircle, BookOpen, Baby, Flower2, 
  Sparkles, ArrowRight, Instagram, Facebook, Globe,
  Pill, Activity, Stethoscope, Lightbulb, Shield
} from 'lucide-react';

const supportGroups = [
  {
    title: 'Period & Cycle Support',
    description: 'Connect with others navigating menstrual health, irregular cycles, and hormonal balance.',
    icon: Activity,
    color: 'bg-primary/10 text-primary',
    members: 'Coming soon',
  },
  {
    title: 'Trying to Conceive',
    description: 'Share your fertility journey, tips, and emotional support with women on the same path.',
    icon: Heart,
    color: 'bg-secondary/10 text-secondary',
    members: 'Coming soon',
  },
  {
    title: 'Pregnancy Circle',
    description: 'Week-by-week discussions, bump updates, and a safe space for expecting mothers.',
    icon: Baby,
    color: 'bg-purple/10 text-purple',
    members: 'Coming soon',
  },
  {
    title: 'IVF Warriors',
    description: 'A supportive community for those going through IVF — sharing experiences, wins, and struggles.',
    icon: Sparkles,
    color: 'bg-turquoise/10 text-turquoise',
    members: 'Coming soon',
  },
  {
    title: 'Menopause & Beyond',
    description: 'Embrace this new chapter with advice, symptom management tips, and peer support.',
    icon: Flower2,
    color: 'bg-accent/10 text-accent',
    members: 'Coming soon',
  },
  {
    title: 'Contraception Choices',
    description: 'Discuss options, side effects, and personal experiences with different contraception methods.',
    icon: Pill,
    color: 'bg-primary/10 text-primary',
    members: 'Coming soon',
  },
];

const resources = [
  {
    title: 'Expert Articles',
    description: 'Doctor-reviewed guides on hormones, fertility, pregnancy, and menopause.',
    icon: BookOpen,
    tag: 'Coming soon',
  },
  {
    title: 'Ask a Doctor',
    description: 'Submit health questions anonymously and get answers from verified professionals.',
    icon: Stethoscope,
    tag: 'Coming soon',
  },
  {
    title: 'Wellness Tips',
    description: 'Nutrition, exercise, and mental health advice tailored to your life stage.',
    icon: Lightbulb,
    tag: 'Coming soon',
  },
  {
    title: 'Safety & Privacy',
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
    description: 'Daily tips, infographics & community stories',
    color: 'hover:bg-pink-50 hover:border-pink-200',
  },
  {
    platform: 'Facebook Group',
    icon: Facebook,
    handle: 'Womanie Community',
    url: 'https://facebook.com/groups/womanie',
    description: 'Join our private group for deeper discussions',
    color: 'hover:bg-blue-50 hover:border-blue-200',
  },
  {
    platform: 'Website & Blog',
    icon: Globe,
    handle: 'womanie.com/blog',
    url: '/blog',
    description: 'In-depth articles and health guides',
    color: 'hover:bg-green-50 hover:border-green-200',
  },
];

const Community = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero */}
      <section className="pt-28 pb-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            You're Never Alone on This Journey
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            Womanie Community is a safe, supportive space where women connect, share experiences, 
            and empower each other through every stage of health and life.
          </p>
          <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-full px-5 py-2.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              We're building something special — launching very soon! 💜
            </span>
          </div>
        </div>
      </section>

      {/* Support Groups */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Support Groups by Life Stage</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Find your tribe — groups tailored to exactly where you are in your health journey.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {supportGroups.map((group) => {
              const Icon = group.icon;
              return (
                <Card key={group.title} className="border border-border/60 hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-xl ${group.color} flex items-center justify-center mb-4`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{group.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{group.description}</p>
                    <span className="inline-block text-xs font-medium bg-muted px-3 py-1 rounded-full text-muted-foreground">
                      {group.members}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Q&A Forum Preview */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="h-7 w-7 text-secondary" />
            </div>
            <h2 className="text-3xl font-bold mb-3">Community Q&A Forum</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Ask questions, share knowledge, and learn from other women's experiences — all moderated for safety.
            </p>
          </div>
          <Card className="border-dashed border-2 border-border">
            <CardContent className="p-8 lg:p-12 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Forum Opening Soon</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-4">
                We're setting up a safe, doctor-moderated space where you can ask anything — 
                from "Is this normal?" to "What worked for you?" No judgment, just support. 🌸
              </p>
              <div className="inline-flex items-center gap-2 text-sm text-primary font-medium">
                <Sparkles className="h-4 w-4" />
                Notifications will be sent when we launch
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Resource Hub */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Resource Hub</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Curated health content reviewed by medical professionals — because you deserve reliable information.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {resources.map((resource) => {
              const Icon = resource.icon;
              return (
                <Card key={resource.title} className="border border-border/60">
                  <CardContent className="p-6 flex gap-4">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{resource.title}</h3>
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-muted px-2 py-0.5 rounded text-muted-foreground">
                          {resource.tag}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{resource.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Social Media Connect */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Connect With Us Today</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              While we finalize the in-app community, join us on social media to start connecting right away!
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {socialLinks.map((social) => {
              const Icon = social.icon;
              return (
                <a
                  key={social.platform}
                  href={social.url}
                  target={social.url.startsWith('http') ? '_blank' : undefined}
                  rel={social.url.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className={`block rounded-xl border border-border p-6 text-center transition-all ${social.color}`}
                >
                  <Icon className="h-8 w-8 mx-auto mb-3 text-foreground/70" />
                  <h3 className="font-semibold mb-1">{social.platform}</h3>
                  <p className="text-sm text-primary font-medium mb-2">{social.handle}</p>
                  <p className="text-xs text-muted-foreground">{social.description}</p>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-primary/5">
        <div className="container mx-auto max-w-2xl text-center">
          <Heart className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-2xl lg:text-3xl font-bold mb-3">
            Be Part of Something Bigger
          </h2>
          <p className="text-muted-foreground mb-6">
            Sign up for Womanie and be the first to know when our community features go live. 
            Together, we're stronger. 💪
          </p>
          <Button size="lg" onClick={() => window.location.href = '/auth/select-type'}>
            Join Womanie
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Community;
