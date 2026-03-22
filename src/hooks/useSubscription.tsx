import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import StoreKit from "@/plugins/StoreKitPlugin";

interface SubscriptionState {
  isSubscribed: boolean;
  tier: string | null;
  tierLabel: string | null;
  loading: boolean;
  checkSubscription: () => Promise<void>;
  restorePurchases: () => Promise<boolean>;
}

const TIER_MAP: Record<string, { label: string; renewal: string }> = {
  "com.physiquecrafters.app.monthly": { label: "Weekly Updates", renewal: "Renews monthly" },
  "com.physiquecrafters.app.biweekly": { label: "Bi-Weekly Updates", renewal: "Renews monthly" },
  "com.physiquecrafters.app.training": { label: "Training Only", renewal: "Renews every 2 months" },
};

const SubscriptionContext = createContext<SubscriptionState>({
  isSubscribed: false,
  tier: null,
  tierLabel: null,
  loading: true,
  checkSubscription: async () => {},
  restorePurchases: async () => false,
});

const isNative = Capacitor.isNativePlatform();

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [tier, setTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyResult = useCallback((has: boolean, productId?: string) => {
    setIsSubscribed(has);
    const id = productId || null;
    setTier(id);
    if (has) {
      localStorage.setItem("subscriptionActive", "true");
      if (id) localStorage.setItem("subscriptionTier", id);
    } else {
      localStorage.removeItem("subscriptionActive");
      localStorage.removeItem("subscriptionTier");
    }
  }, []);

  const checkSubscription = useCallback(async () => {
    if (isNative) {
      try {
        const result = await Promise.race([
          StoreKit.checkSubscription(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        if (result && typeof result === "object") {
          applyResult(result.hasSubscription, result.productIDs?.[0]);
        } else {
          const saved = localStorage.getItem("subscriptionActive") === "true";
          setIsSubscribed(saved);
          setTier(saved ? localStorage.getItem("subscriptionTier") : null);
        }
      } catch {
        const saved = localStorage.getItem("subscriptionActive") === "true";
        setIsSubscribed(saved);
        setTier(saved ? localStorage.getItem("subscriptionTier") : null);
      }
    } else {
      const saved = localStorage.getItem("subscriptionActive") === "true";
      setIsSubscribed(saved);
      setTier(saved ? localStorage.getItem("subscriptionTier") : null);
    }
    setLoading(false);
  }, [applyResult]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!isNative) return false;
    try {
      const result = await StoreKit.restorePurchases();
      applyResult(result.hasSubscription, result.productIDs?.[0]);
      return result.hasSubscription;
    } catch {
      return false;
    }
  }, [applyResult]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      applyResult(detail?.hasSubscription, detail?.productIDs?.[0]);
    };
    window.addEventListener("subscriptionUpdate", handler);
    return () => window.removeEventListener("subscriptionUpdate", handler);
  }, [applyResult]);

  useEffect(() => {
    checkSubscription();
    const safety = setTimeout(() => setLoading(false), 6000);
    return () => clearTimeout(safety);
  }, [checkSubscription]);

  const tierLabel = tier ? (TIER_MAP[tier]?.label || "Active Plan") : null;

  return (
    <SubscriptionContext.Provider value={{ isSubscribed, tier, tierLabel, loading, checkSubscription, restorePurchases }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}

export { TIER_MAP };
