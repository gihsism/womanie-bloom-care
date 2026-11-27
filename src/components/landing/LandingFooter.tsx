import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Logo from '@/components/brand/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { Column } from './parts';

// A plain colophon: one closing line with the sign-up action, then the links.
// No social icons (there are no Womanie accounts to link to), no newsletter box.

const LINKS = [
  { label: 'Product', to: '/product' },
  { label: 'For doctors', to: '/for-doctors' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'About', to: '/about' },
  { label: 'Blog', to: '/blog' },
  { label: 'Install the app', to: '/install' },
  { label: 'Privacy', to: '/privacy' },
];

export default function LandingFooter() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <footer className="pb-10 pt-6 lg:pb-14">
      <Column>
        {!user && (
          <div className="flex flex-col gap-5 border-t border-foreground/70 py-10 sm:flex-row sm:items-center sm:justify-between lg:py-14">
            <p className="max-w-xl font-display text-2xl leading-snug lg:text-3xl">
              Start with the last blood test you had.
            </p>
            <Button size="lg" className="h-12 self-start px-8 text-base sm:self-auto" onClick={() => navigate('/auth/select-type')}>
              Create a free account
            </Button>
          </div>
        )}

        <div className="grid gap-8 border-t border-border pt-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link to="/" aria-label="Womanie, back to the top of the homepage" className="inline-block text-xl">
              <Logo />
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">© {new Date().getFullYear()} Womanie</p>
          </div>
          <nav aria-label="Footer" className="lg:col-span-8">
            <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
              {LINKS.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="inline-flex min-h-[44px] items-center text-[15px] text-muted-foreground hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Column>
    </footer>
  );
}
