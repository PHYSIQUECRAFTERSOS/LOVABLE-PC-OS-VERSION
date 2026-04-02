import { registerPlugin } from '@capacitor/core';

export interface CacheBusterPlugin {
  clearCache(): Promise<{ cleared: boolean }>;
}

const CacheBuster = registerPlugin<CacheBusterPlugin>('CacheBuster');

export default CacheBuster;
