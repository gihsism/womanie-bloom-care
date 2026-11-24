import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Check, Zap, WifiOff, Maximize } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { IconRows, PublicHero, PublicSection } from '@/components/public/PublicUI';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const Install = () => {
  usePageTitle('Install the app');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const iosSteps = [
    { n: 1, title: 'Tap ··· then Share', description: 'The ··· button is at the bottom right of Safari. On older iPhones, tap the Share button instead: the square with an arrow pointing up.' },
    { n: 2, title: 'Tap "Add to Home Screen"', description: "If you don't see it, tap \"View More\" or scroll down the list." },
    { n: 3, title: 'Tap "Add"', description: 'Leave "Open as Web App" switched on if you see it. Womanie appears on your home screen like a regular app.' },
  ];
  const androidSteps = [
    { n: 1, title: 'Open the browser menu', description: 'Tap the three dots in the top-right corner of your browser.' },
    { n: 2, title: 'Tap "Add to Home screen" or "Install app"', description: 'The wording depends on your browser.' },
    { n: 3, title: 'Confirm', description: 'Tap Install or Add. Womanie appears on your home screen like a regular app.' },
  ];
  const why = [
    { icon: Zap, title: 'Quick to open', description: 'Starts straight from your home screen.' },
    { icon: WifiOff, title: 'Works offline', description: 'See your data even without internet.' },
    { icon: Maximize, title: 'Full screen', description: 'No browser bars, just Womanie.' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <PublicHero
          title="Install Womanie"
          sub="Add Womanie to your home screen: quicker to open and it feels like an app."
          cta={!isInstalled && !isIOS && deferredPrompt ? { label: 'Install Womanie', onClick: handleInstallClick } : undefined}
        />

        {isInstalled ? (
          <PublicSection>
            <div className="panel bg-stage-tint border-stage-accent/30 p-5 flex gap-3.5 items-start">
              <Check className="h-6 w-6 text-stage-accent shrink-0" aria-hidden="true" />
              <div>
                <h2 className="text-[17px] font-bold">Already installed</h2>
                <p className="text-[15px] text-muted-foreground">Womanie is on this device. You'll find it on your home screen.</p>
              </div>
            </div>
          </PublicSection>
        ) : isIOS ? (
          <PublicSection title="On iPhone or iPad">
            <IconRows items={iosSteps} />
          </PublicSection>
        ) : deferredPrompt ? null : (
          <PublicSection title="On Android">
            <IconRows items={androidSteps} />
          </PublicSection>
        )}

        <PublicSection title="Why install it?" className="pb-16">
          <IconRows items={why} />
        </PublicSection>
      </main>
      <Footer />
    </div>
  );
};

export default Install;
