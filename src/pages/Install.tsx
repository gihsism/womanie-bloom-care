import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, Smartphone, Check, ArrowLeft } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const Install = () => {
  const navigate = useNavigate();
  usePageTitle('Install App');
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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-2xl">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-8"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Smartphone className="h-10 w-10 text-primary-foreground" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-4">
              Install Womanie
            </h1>
            <p className="text-muted-foreground text-lg">
              Add Womanie to your home screen for quick access and an app-like experience.
            </p>
          </div>

          {isInstalled ? (
            <Card className="p-8 text-center bg-primary/10 border-primary/20">
              <Check className="h-16 w-16 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Already Installed!</h2>
              <p className="text-muted-foreground">
                Womanie is installed on your device. You can find it on your home screen.
              </p>
            </Card>
          ) : isIOS ? (
            <Card className="p-8">
              <h2 className="text-xl font-bold mb-6 text-center">Install on iPhone/iPad</h2>
              <ol className="space-y-4">
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold">1</span>
                  <div>
                    <p className="font-medium">Tap the Share button</p>
                    <p className="text-sm text-muted-foreground">It's the square with an arrow pointing up at the bottom of Safari.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold">2</span>
                  <div>
                    <p className="font-medium">Scroll and tap "Add to Home Screen"</p>
                    <p className="text-sm text-muted-foreground">You may need to scroll down to find this option.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold">3</span>
                  <div>
                    <p className="font-medium">Tap "Add"</p>
                    <p className="text-sm text-muted-foreground">Womanie will appear on your home screen like a regular app.</p>
                  </div>
                </li>
              </ol>
            </Card>
          ) : deferredPrompt ? (
            <Card className="p-8 text-center">
              <Download className="h-16 w-16 text-primary mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-4">Ready to Install</h2>
              <p className="text-muted-foreground mb-6">
                Click the button below to add Womanie to your home screen.
              </p>
              <Button size="lg" onClick={handleInstallClick} className="w-full sm:w-auto">
                <Download className="mr-2 h-5 w-5" />
                Install Womanie
              </Button>
            </Card>
          ) : (
            <Card className="p-8">
              <h2 className="text-xl font-bold mb-6 text-center">Install on Android</h2>
              <ol className="space-y-4">
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold">1</span>
                  <div>
                    <p className="font-medium">Open browser menu</p>
                    <p className="text-sm text-muted-foreground">Tap the three dots in the top-right corner of your browser.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold">2</span>
                  <div>
                    <p className="font-medium">Tap "Add to Home screen" or "Install app"</p>
                    <p className="text-sm text-muted-foreground">The wording may vary by browser.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold">3</span>
                  <div>
                    <p className="font-medium">Confirm installation</p>
                    <p className="text-sm text-muted-foreground">Womanie will appear on your home screen like a regular app.</p>
                  </div>
                </li>
              </ol>
            </Card>
          )}

          <div className="mt-12 text-center">
            <h3 className="font-semibold mb-4">Why install Womanie?</h3>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="font-medium">Quick Access</p>
                <p className="text-muted-foreground">Launch instantly from your home screen</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="font-medium">Works Offline</p>
                <p className="text-muted-foreground">Access your data even without internet</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="font-medium">Full Screen</p>
                <p className="text-muted-foreground">Enjoy an immersive app experience</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Install;
