import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.physiquecrafters.app',
  appName: 'physique-crafters-os',
  webDir: 'dist',
  server: {
    url: 'https://app.physiquecrafters.com',
    cleartext: true,
    allowNavigation: ['app.physiquecrafters.com'],
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    backgroundColor: '#0a0a0a',
    scrollEnabled: false,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: '#0a0a0a',
  },
  plugins: {
    Camera: {
      permissions: ['camera', 'photos'],
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      // Native OS splash is held until the JS layer explicitly calls
      // SplashScreen.hide() (see SplashGate). Background matches brand
      // so the static frame visually matches AnimatedSplash's start state.
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#0a0a0a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
