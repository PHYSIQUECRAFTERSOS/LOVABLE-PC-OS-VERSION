import { registerPlugin } from '@capacitor/core';

export interface StoreKitPlugin {
  showPaywall(): Promise<void>;
  checkSubscription(): Promise<{ hasSubscription: boolean; productIDs?: string[] }>;
  restorePurchases(): Promise<{ hasSubscription: boolean; productIDs?: string[] }>;
}

const StoreKit = registerPlugin<StoreKitPlugin>('StoreKit');
export default StoreKit;
