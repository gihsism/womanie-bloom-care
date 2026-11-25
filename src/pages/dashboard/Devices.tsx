import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import SubPageHeader from '@/components/SubPageHeader';
import { Watch, Heart, Activity, Bluetooth, Smartphone, Loader2 } from 'lucide-react';
import { healthKitService } from '@/services/healthkit';
import { toast } from 'sonner';

interface Device {
  id: string;
  name: string;
  brand: string;
  icon: React.ReactNode;
  description: string;
  status: 'available' | 'coming_soon' | 'connected';
  requirement?: string;
  features: string[];
  color: string;
}

const Devices = () => {
  const navigate = useNavigate();
  usePageTitle('Connected devices');
  const [connecting, setConnecting] = useState(false);
  const [healthKitConnected, setHealthKitConnected] = useState(false);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    healthKitService.initialize().then((available) => {
      setIsNative(available);
    });
  }, []);

  const devices: Device[] = [
    {
      id: 'apple-health',
      name: 'Apple Health',
      brand: 'Apple',
      icon: <Heart className="h-7 w-7" />,
      description: 'Sync cycle data, heart rate, sleep, and activity from Apple Health. Works with Apple Watch, iPhone, and all HealthKit-compatible devices.',
      status: healthKitConnected ? 'connected' : 'available',
      requirement: !isNative ? 'Requires native iOS app (install via TestFlight or build with Capacitor)' : undefined,
      features: ['Menstrual cycle sync', 'Heart rate monitoring', 'Sleep tracking', 'Step count & activity', 'Body temperature'],
      color: 'text-primary',
    },
    {
      id: 'oura-ring',
      name: 'Oura Ring',
      brand: 'Oura',
      icon: <Activity className="h-7 w-7" />,
      description: 'Connect your Oura Ring to import sleep quality, readiness scores, body temperature trends, and activity data.',
      status: 'coming_soon',
      features: ['Body temperature trends', 'Sleep quality scores', 'Readiness score', 'Heart rate variability', 'Activity tracking'],
      color: 'text-secondary',
    },
    {
      id: 'fitbit',
      name: 'Fitbit',
      brand: 'Google',
      icon: <Watch className="h-7 w-7" />,
      description: 'Sync menstrual tracking, heart rate, sleep stages, and daily activity from your Fitbit device.',
      status: 'coming_soon',
      features: ['Menstrual tracking', 'Heart rate zones', 'Sleep stages', 'SpO2 monitoring', 'Stress management'],
      color: 'text-accent',
    },
    {
      id: 'garmin',
      name: 'Garmin',
      brand: 'Garmin',
      icon: <Bluetooth className="h-7 w-7" />,
      description: 'Import health metrics from Garmin watches including body battery, stress, and menstrual cycle tracking.',
      status: 'coming_soon',
      features: ['Body battery', 'Stress tracking', 'Menstrual cycle', 'Pulse Ox', 'Advanced sleep'],
      color: 'text-muted-foreground',
    },
    {
      id: 'samsung-health',
      name: 'Samsung Health',
      brand: 'Samsung',
      icon: <Smartphone className="h-7 w-7" />,
      description: 'Connect Samsung Health to sync data from Galaxy Watch and Samsung phones.',
      status: 'coming_soon',
      features: ['Heart rate', 'Blood pressure', 'Body composition', 'Sleep tracking', 'Cycle tracking'],
      color: 'text-muted-foreground',
    },
  ];

  const connectAppleHealth = async () => {
    setConnecting(true);
    try {
      const granted = await healthKitService.requestPermissions();
      if (granted) {
        setHealthKitConnected(true);
        const data = await healthKitService.getAllHealthData();
        toast.success('Apple Health connected!', {
          description: `Synced ${data.steps} steps, ${data.heartRate?.length || 0} heart rate readings`,
        });
      } else {
        toast.error('Permission denied', { description: 'Please allow HealthKit access in Settings.' });
      }
    } catch {
      toast.error('Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const apple = devices[0];
  const later = devices.filter(d => d.status === 'coming_soon');

  return (
    <div className="min-h-screen bg-background">
      <SubPageHeader title="Connected devices" backTo="/dashboard/settings" backLabel="Me" />

      <div className="w-full max-w-3xl mx-auto px-4 py-5 space-y-6">
        <p className="page-intro">
          Connect a watch or health app and Womanie fills in sleep, heart rate and cycle data for you.
        </p>

        {/* The one device that works today, with the page's one button. */}
        <section className="panel p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stage-tint text-stage-accent">
              <Heart className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-bold">{apple.name}</h2>
              <p className="text-[14px] text-muted-foreground">
                {healthKitConnected ? 'Connected' : 'Cycle, heart rate, sleep, steps, temperature'}
              </p>
            </div>
          </div>
          {healthKitConnected ? (
            <p className="text-[15px] text-muted-foreground">Your Apple Health data now syncs with Womanie.</p>
          ) : isNative ? (
            <button type="button" className="btn-stage w-full" disabled={connecting} onClick={connectAppleHealth}>
              {connecting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {connecting ? 'Connecting…' : 'Connect Apple Health'}
            </button>
          ) : (
            <>
              <p className="text-[15px] text-muted-foreground">Works in the Womanie iPhone app.</p>
              <button type="button" className="btn-stage w-full" onClick={() => navigate('/install')}>
                Get the app
              </button>
            </>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="section-title">Coming later</h2>
          <ul className="row-group">
            {later.map(d => (
              <li key={d.id} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{d.icon}</span>
                <span className="flex-1 text-[16px] font-semibold">{d.name}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default Devices;
