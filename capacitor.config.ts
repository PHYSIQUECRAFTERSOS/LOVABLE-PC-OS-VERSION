import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.418c5cb36f9242439691d28363e319a3',
  appName: 'physique-crafters-os',
  webDir: 'dist',
  server: {
    url: 'https://app.physiquecrafters.com?v=11',
    cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    packageClassList: ['StoreKitPlugin'],
  },
  plugins: {
    Camera: {
      permissions: ['camera', 'photos'],
    },
  },
};

export default config;
