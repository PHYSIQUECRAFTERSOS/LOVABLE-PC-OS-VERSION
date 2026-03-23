import { registerPlugin } from '@capacitor/core';

export interface StoreKitProduct {
  id: string;
  price: string;
  displayName: string;
  description: string;
}

export interface StoreKitPlugin {
  /** Purchase a specific product by ID — triggers native Apple payment sheet */
  purchase(options: { productId: string }): Promise<{ success: boolean; productId: string }>;

  /** Check current subscription entitlements */
  checkSubscription(): Promise<{ hasSubscription: boolean; productIDs?: string[] }>;

  /** Restore previous purchases (required by Apple) */
  restorePurchases(): Promise<{ hasSubscription: boolean; productIDs?: string[] }>;

  /** Fetch live product info (price, name) from App Store */
  getProducts(options: { productIds: string[] }): Promise<{ products: StoreKitProduct[] }>;

  /** @deprecated Use purchase() instead — kept for backward compat */
  showPaywall(): Promise<void>;
}

const StoreKit = registerPlugin<StoreKitPlugin>('StoreKit');
export default StoreKit;
