import { Card } from '@/components/ui/card';
import { Heart, Target, Users, Award, Shield, Code } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import alenaPhoto from '@/assets/alena-photo.png';
import marinaPhoto from '@/assets/marina-photo.jpg';
import johnPhoto from '@/assets/john-photo.png';

const About = () => {

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
      <Navigation />

      {/* Hero Section */}
      <section className="py-16 lg:py-24 pt-32">
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
                Womanie was born from deeply personal experiences. Our founders—a patient who spent years navigating 
                the complexities of women's healthcare, a gynecologist who walked the same fertility journey with her 
                patients, and a tech entrepreneur who saw the gap between healthcare and technology.
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

      {/* Meet the Founders */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-4">Meet the Founders</h2>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-12">
            Three people united by a shared mission: to transform women's healthcare through technology, 
            empathy, and medical expertise.
          </p>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Alena */}
            <Card className="p-8 text-center hover:shadow-lg transition-shadow">
              <img 
                src={alenaPhoto} 
                alt="Alena - CEO & Co-Founder" 
                className="w-24 h-24 mx-auto mb-6 rounded-full object-cover object-top"
              />
              <h3 className="text-xl font-bold mb-1">Alena</h3>
              <p className="text-primary font-semibold mb-4">CEO & Co-Founder</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Former Senior Manager at a Big-4 firm with experience in audit, technical accounting, and 
                the energy sector. Holds ACCA and Swiss Audit License qualifications, with expertise in IFRS, 
                US GAAP, Swiss CO, and Swiss FER. After hundreds of appointments with gynecologists, 
                urologists, and fertility specialists, Alena experienced firsthand how fragmented women's 
                healthcare can be—her personal fertility journey became the catalyst for building a better solution.
              </p>
            </Card>

            {/* Marina */}
            <Card className="p-8 text-center hover:shadow-lg transition-shadow">
              <img 
                src={marinaPhoto} 
                alt="Marina - CMO & Co-Founder" 
                className="w-24 h-24 mx-auto mb-6 rounded-full object-cover object-top"
              />
              <h3 className="text-xl font-bold mb-1">Marina</h3>
              <p className="text-secondary font-semibold mb-4">CMO & Co-Founder</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Practicing gynecologist in Zurich with over 15 years of experience. Marina's understanding 
                of women's health is both professional and personal—she went through her own fertility 
                challenges before successfully giving birth to her baby boy. She ensures every feature 
                is medically sound and truly helpful.
              </p>
            </Card>

            {/* John */}
            <Card className="p-8 text-center hover:shadow-lg transition-shadow">
              <img 
                src={johnPhoto} 
                alt="John - CTO & Co-Founder" 
                className="w-24 h-24 mx-auto mb-6 rounded-full object-cover object-top"
              />
              <h3 className="text-xl font-bold mb-1">John</h3>
              <p className="text-accent font-semibold mb-4">CTO & Co-Founder</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Serial entrepreneur bridging IT and healthcare, with an impressive track record spanning Roche, Oxford University, 
                NHS, and businesses across the globe. John brings world-class technical expertise and a 
                deep understanding of healthcare systems to build technology that truly serves patients 
                and providers alike.
              </p>
            </Card>
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

      <Footer />
    </div>
  );
};

export default About;
