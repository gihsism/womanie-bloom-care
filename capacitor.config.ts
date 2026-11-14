import type { CapacitorConfig } from '@capacitor/cli';

// Native shell for the App Store / Play Store. It loads the live site so
// sign-in (cookie sessions), uploads and the API behave exactly as on the
// web and every deploy reaches the app without a store release.
const config: CapacitorConfig = {
  appId: 'info.womanie.app',
  appName: 'Womanie',
  webDir: 'dist',
  server: {
    url: 'https://womanie.info',
    allowNavigation: ['womanie.info', '*.womanie.info'],
  },
  ios: {
    // The web page handles the status-bar area itself (safe-area CSS in index.css).
    contentInset: 'never',
  },
  plugins: {
    // Keep the web view below the clock/battery bar instead of under it.
    StatusBar: { overlaysWebView: false, style: 'LIGHT', backgroundColor: '#FFF8F2' },
  },
};

export default config;
