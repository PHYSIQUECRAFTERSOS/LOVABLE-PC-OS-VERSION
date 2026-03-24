import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.418c5cb36f9242439691d28363e319a3',
  appName: 'physique-crafters-os',
  webDir: 'dist',
  server: {
    url: 'https://app.physiquecrafters.com',
    cleartext: true,
    allowNavigation: ['app.physiquecrafters.com'],
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
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
