/**
 * HealthKit integration service for Apple Health data sync.
 * 
 * This service provides a bridge to Apple HealthKit via Capacitor.
 * It requires:
 * 1. A native iOS build via Capacitor
 * 2. The @niceplugins/capacitor-healthkit plugin installed after `npx cap add ios`
 * 3. HealthKit entitlement enabled in Xcode
 * 
 * In the web/PWA version, all methods return graceful fallbacks.
 */

export interface HealthKitData {
  heartRate?: number[];
  steps?: number;
  sleepHours?: number;
  bodyTemperature?: number;
  menstrualFlow?: string;
  lastSyncedAt?: string;
}

type HealthKitPlugin = {
  requestAuthorization: (opts: { all: string[]; read: string[]; write: string[] }) => Promise<void>;
  queryHKitSampleType: (opts: { sampleName: string; startDate: string; endDate: string; limit: number }) => Promise<{ resultData: Array<{ value: number; startDate: string; endDate: string }> }>;
};

class HealthKitService {
  private plugin: HealthKitPlugin | null = null;
  private isNative = false;

  async initialize(): Promise<boolean> {
    try {
      // Dynamically import Capacitor to check platform
      const { Capacitor } = await import('@capacitor/core');
      this.isNative = Capacitor.isNativePlatform();

      if (!this.isNative) {
        console.log('HealthKit: Not running on native platform. Using web fallback.');
        return false;
      }

      // The HealthKit plugin will be available after native setup
      // Users need to install: npm install @niceplugins/capacitor-healthkit
      try {
        const pluginName = '@niceplugins/capacitor-healthkit';
        const mod = await import(/* @vite-ignore */ pluginName);
        this.plugin = mod.HealthKit || mod.default;
      } catch {
        console.log('HealthKit: Plugin not installed. Install @niceplugins/capacitor-healthkit after adding iOS platform.');
        return false;
      }

      return true;
    } catch (error) {
      console.log('HealthKit: Initialization failed', error);
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (!this.plugin) return false;

    try {
      await this.plugin.requestAuthorization({
        all: [],
        read: [
          'HKQuantityTypeIdentifierHeartRate',
          'HKQuantityTypeIdentifierStepCount',
          'HKQuantityTypeIdentifierBodyTemperature',
          'HKCategoryTypeIdentifierSleepAnalysis',
          'HKCategoryTypeIdentifierMenstrualFlow',
        ],
        write: [],
      });
      return true;
    } catch (error) {
      console.error('HealthKit: Permission request failed', error);
      return false;
    }
  }

  async getHeartRate(days: number = 7): Promise<number[]> {
    if (!this.plugin) return [];

    try {
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const result = await this.plugin.queryHKitSampleType({
        sampleName: 'HKQuantityTypeIdentifierHeartRate',
        startDate,
        endDate,
        limit: 100,
      });

      return result.resultData.map((r) => r.value);
    } catch {
      return [];
    }
  }

  async getSteps(days: number = 1): Promise<number> {
    if (!this.plugin) return 0;

    try {
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const result = await this.plugin.queryHKitSampleType({
        sampleName: 'HKQuantityTypeIdentifierStepCount',
        startDate,
        endDate,
        limit: 1000,
      });

      return result.resultData.reduce((sum, r) => sum + r.value, 0);
    } catch {
      return 0;
    }
  }

  async getBodyTemperature(): Promise<number | null> {
    if (!this.plugin) return null;

    try {
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const result = await this.plugin.queryHKitSampleType({
        sampleName: 'HKQuantityTypeIdentifierBodyTemperature',
        startDate,
        endDate,
        limit: 1,
      });

      return result.resultData.length > 0 ? result.resultData[0].value : null;
    } catch {
      return null;
    }
  }

  async getAllHealthData(): Promise<HealthKitData> {
    const [heartRate, steps, bodyTemperature] = await Promise.all([
      this.getHeartRate(),
      this.getSteps(),
      this.getBodyTemperature(),
    ]);

    return {
      heartRate,
      steps,
      bodyTemperature: bodyTemperature ?? undefined,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  isAvailable(): boolean {
    return this.isNative && this.plugin !== null;
  }
}

export const healthKitService = new HealthKitService();
