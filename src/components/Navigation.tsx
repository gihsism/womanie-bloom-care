import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // ESC key to close menu
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  // Focus first menu item when opened
  useEffect(() => {
    if (isMobileMenuOpen) {
      const firstLink = menuRef.current?.querySelector('button');
      firstLink?.focus();
    }
  }, [isMobileMenuOpen]);

  const navLinks = [
    { label: 'Product', href: '/product' },
    { label: 'For Patients', href: '/for-patients' },
    { label: 'For Doctors', href: '/for-doctors' },
    { label: 'Community', href: '/community' },
    { label: 'About', href: '/about' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Blog', href: '/blog' },
  ];

  const isActive = (href: string) => {
    if (href === '/' && location.pathname === '/') return true;
    return location.pathname === href;
  };

  const handleNav = useCallback((href: string) => {
    navigate(href);
    setIsMobileMenuOpen(false);
  }, [navigate]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-background/95 backdrop-blur-sm shadow-sm' : 'bg-transparent'
      }`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); navigate('/'); }}
            className="text-2xl font-bold text-primary hover:opacity-80 transition-opacity"
            aria-label="Womanie — go to homepage"
          >
            Womanie
          </a>

          {/* Desktop Navigation Links */}
          <div className="hidden xl:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNav(link.href)}
                className={`text-sm font-medium transition-colors relative ${
                  isActive(link.href)
                    ? 'text-primary font-semibold'
                    : 'text-foreground/80 hover:text-primary'
                }`}
              >
                {link.label}
                {isActive(link.href) && (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Auth buttons — visible from md up */}
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/welcome')}>
                    My Space
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    const { supabase } = await import('@/integrations/supabase/client');
                    await supabase.auth.signOut();
                    window.location.href = '/';
                  }}>
                    Log Out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/auth/login')}>
                    Log In
                  </Button>
                  <Button size="sm" onClick={() => navigate('/auth/select-type')}>
                    Get Started
                  </Button>
                </>
              )}
            </div>

            {/* Hamburger */}
            <button
              ref={toggleRef}
              className="xl:hidden p-2 rounded-lg hover:bg-muted/50 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile/Tablet Menu */}
        <div
          id="mobile-menu"
          ref={menuRef}
          className={`xl:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            isMobileMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
          role="menu"
          aria-hidden={!isMobileMenuOpen}
        >
          <div className="py-4 border-t border-border bg-background shadow-lg">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  role="menuitem"
                  onClick={() => handleNav(link.href)}
                  className={`text-sm font-medium transition-colors text-left py-2.5 px-2 rounded-lg ${
                    isActive(link.href)
                      ? 'text-primary font-semibold bg-primary/5'
                      : 'text-foreground/80 hover:text-primary hover:bg-muted/50'
                  }`}
                >
                  {link.label}
                </button>
              ))}
              {/* Auth buttons in menu on small screens */}
              <div className="flex flex-col gap-2 pt-4 border-t border-border mt-2 md:hidden">
                {user ? (
                  <>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => handleNav('/welcome')}
                    >
                      My Space
                    </Button>
                    <Button
                      className="w-full"
                      onClick={() => handleNav('/dashboard')}
                    >
                      Dashboard
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={async () => {
                        const { supabase } = await import('@/integrations/supabase/client');
                        await supabase.auth.signOut();
                        setIsMobileMenuOpen(false);
                        window.location.href = '/';
                      }}
                    >
                      Log Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => handleNav('/auth/login')}
                    >
                      Log In
                    </Button>
                    <Button
                      className="w-full"
                      onClick={() => handleNav('/auth/select-type')}
                    >
                      Get Started
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
