import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Watch, Heart, Activity, Bluetooth, Smartphone, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
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
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
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

  const getStatusBadge = (status: Device['status']) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-secondary/20 text-secondary border-secondary/30">Connected</Badge>;
      case 'available':
        return <Badge className="bg-primary/20 text-primary border-primary/30">Available</Badge>;
      case 'coming_soon':
        return <Badge variant="outline" className="text-muted-foreground">Coming Soon</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Connected Devices</h1>
              <p className="text-xs text-muted-foreground">Sync health data from your wearables</p>
            </div>
            <a href="/" className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
              Womanie
            </a>
          </div>
        </div>
      </div>

      <div className="w-full px-4 py-6 space-y-6">
        {/* Info Banner */}
        <Card className="p-4 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 border-primary/20">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Watch className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Enhance your health tracking</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Connect your wearable devices to automatically sync health data with Womanie for more accurate cycle predictions and personalized insights.
              </p>
            </div>
          </div>
        </Card>

        {/* Device Cards */}
        <div className="space-y-3">
          {devices.map((device) => {
            const isExpanded = expandedDevice === device.id;
            
            return (
              <Card
                key={device.id}
                className={`overflow-hidden transition-all duration-200 ${
                  device.status === 'coming_soon' ? 'opacity-70' : ''
                }`}
              >
                <button
                  className="w-full p-4 text-left"
                  onClick={() => setExpandedDevice(isExpanded ? null : device.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center ${device.color}`}>
                      {device.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold">{device.name}</h3>
                        {getStatusBadge(device.status)}
                      </div>
                      <p className="text-xs text-muted-foreground">{device.brand}</p>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground">{device.description}</p>

                    {device.requirement && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">{device.requirement}</p>
                      </div>
                    )}

                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Synced Data</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {device.features.map((feature) => (
                          <Badge key={feature} variant="secondary" className="text-xs font-normal">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {device.status === 'available' && (
                      <div className="space-y-2">
                        <Button 
                          className="w-full gap-2" 
                          size="lg"
                          disabled={connecting || (device.id === 'apple-health' && !isNative)}
                          onClick={async () => {
                            if (device.id === 'apple-health') {
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
                            }
                          }}
                        >
                          {connecting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          {connecting ? 'Connecting...' : `Connect ${device.name}`}
                        </Button>
                        {device.id === 'apple-health' && !isNative && (
                          <p className="text-[10px] text-center text-amber-600 dark:text-amber-400">
                            Build the native iOS app with Capacitor to enable Apple Health
                          </p>
                        )}
                        {(device.id !== 'apple-health' || isNative) && (
                          <p className="text-[10px] text-center text-muted-foreground">
                            You'll be redirected to authorize access to your health data
                          </p>
                        )}
                      </div>
                    )}

                    {device.status === 'coming_soon' && (
                      <Button variant="outline" className="w-full gap-2" disabled>
                        Coming Soon
                      </Button>
                    )}

                    {device.status === 'connected' && (
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 gap-2">
                          <Activity className="h-4 w-4" />
                          Sync Now
                        </Button>
                        <Button variant="ghost" className="text-destructive hover:text-destructive">
                          Disconnect
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Native App CTA */}
        <Card className="p-5 border-dashed">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Smartphone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Need the native app?</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Apple Health integration requires the native iOS app. Install it for full device connectivity.
              </p>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => navigate('/install')}>
              <ExternalLink className="h-4 w-4" />
              Install App
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Devices;
