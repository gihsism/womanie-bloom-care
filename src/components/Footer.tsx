import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const Footer = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ variant: 'destructive', title: 'Invalid email', description: 'Please enter a valid email address.' });
      return;
    }
    setSubscribing(true);
    try {
      const resp = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!resp.ok) throw new Error(`subscribe failed (${resp.status})`);
      toast({ title: 'Subscribed!', description: 'Thanks for signing up. We\'ll keep you in the loop.' });
      setEmail('');
    } catch {
      toast({ variant: 'destructive', title: 'Something went wrong', description: 'Could not subscribe right now — please try again later.' });
    } finally {
      setSubscribing(false);
    }
  };

  const footerLinks = {
    Company: [
      { label: 'About', href: '/about' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'For patients', href: '/for-patients' },
      { label: 'For doctors', href: '/for-doctors' },
    ],
    Product: [
      { label: 'Features', href: '/product' },
      { label: 'Ask AI', href: '/product' },
      { label: 'Install the app', href: '/install' },
      { label: 'Community', href: '/community' },
    ],
    Resources: [
      { label: 'Blog', href: '/blog' },
      { label: 'Health statistics', href: '/health-statistics' },
    ],
    Legal: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/dashboard/terms' },
    ],
  };

  return (
    <footer className="bg-background border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-10 lg:py-14">
        {/* Newsletter */}
        <div className="mb-10 pb-10 border-b border-line">
          <div className="max-w-xl">
            <h2 className="section-title mb-1">Health tips by email</h2>
            <p className="text-[15px] text-muted-foreground mb-4">
              Health tips and product news, now and then. Unsubscribe any time.
            </p>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter your email"
                className="flex-1 h-12 rounded-full px-5 text-[16px] md:text-[16px]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email address for newsletter"
              />
              <Button type="submit" variant="outline" className="h-12 px-5 text-[15px] font-semibold" disabled={subscribing}>{subscribing ? 'Subscribing…' : 'Subscribe'}</Button>
            </form>
          </div>
        </div>

        {/* Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-[15px] font-bold mb-3">{category}</h3>
              <ul className="space-y-1">
                {links.map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => navigate(link.href)}
                      className="min-h-9 text-[15px] text-muted-foreground hover:text-stage-accent transition-colors text-left"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-6 border-t border-line">
          <button
            onClick={() => navigate('/')}
            className="text-xl font-extrabold text-stage-accent hover:opacity-80 transition-opacity"
          >
            Womanie
          </button>
          <span className="text-[14px] text-muted-foreground">
            © {new Date().getFullYear()} All rights reserved
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
