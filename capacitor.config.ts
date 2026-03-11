import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.physiquecrafters.app',
  appName: 'Physique Crafters',
  webDir: 'dist',
  // server.url intentionally removed — app loads from local dist/ in production
  // For live reload during native dev only, restore server.url temporarily
};

export default config;
