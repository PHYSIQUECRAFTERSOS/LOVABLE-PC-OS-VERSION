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
  },
};

export default config;
