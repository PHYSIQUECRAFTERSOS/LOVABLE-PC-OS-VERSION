import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/useSubscription";
import { Capacitor } from "@capacitor/core";
import StoreKit from "@/plugins/StoreKitPlugin";
import type { StoreKitProduct } from "@/plugins/StoreKitPlugin";
import SuccessOverlay from "@/components/subscription/SuccessOverlay";

interface Plan {
  id: string;
  productId: string;
  title: string;
  price: string;
  duration: string;
  badge?: string;
  features: string[];
}

const DEFAULT_PLANS: Plan[] = [
  {
    id: "weekly",
    productId: "com.physiquecrafters.app.monthly",
    title: "Weekly Updates",
    price: "$499.99 USD/month",
    duration: "1 month · Auto-renewable",
    badge: "MOST POPULAR",
    features: [
      "Weekly progress updates reviewing over your progress and we make changes to your program as necessary",
      "Custom training program",
      "Custom meal plan",
      "Custom supplement plan",
    ],
  },
  {
    id: "biweekly",
    productId: "com.physiquecrafters.app.biweekly",
    title: "Bi-Weekly Updates",
    price: "$399.00 USD/month",
    duration: "1 month · Auto-renewable",
    features: [
      "Bi-weekly progress updates",
      "Custom training program",
      "Custom meal plan",
      "Custom supplement plan",
    ],
  },
];
const isNative = Capacitor.isNativePlatform();

const Subscribe = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { checkSubscription, restorePurchases } = useSubscription();
  const [selected, setSelected] = useState("weekly");
  const [subscribing, setSubscribing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successPlan, setSuccessPlan] = useState("");
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [loadedProductIds, setLoadedProductIds] = useState<Set<string>>(new Set());

  const fetchProducts = async (): Promise<boolean> => {
    try {
      const productIds = DEFAULT_PLANS.map((p) => p.productId);
      const result = await Promise.race([
        StoreKit.getProducts({ productIds }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
      if (result && result.products && result.products.length > 0) {
        const fetchedIds = new Set(result.products.map((p: StoreKitProduct) => p.id));
        setLoadedProductIds(fetchedIds);
        setPlans((prev) =>
          prev.map((plan) => {
            const live = result.products.find((p: StoreKitProduct) => p.id === plan.productId);
            if (live) {
              return { ...plan, price: live.price, title: live.displayName || plan.title };
            }
            return plan;
          })
        );
        return true;
      }
      console.warn("[Subscribe] getProducts returned empty or timed out", result);
      return false;
    } catch (err) {
      console.warn("[Subscribe] getProducts failed", err);
      return false;
    }
  };

  // Fetch live pricing from App Store on mount (graceful fallback to defaults)
  useEffect(() => {
    if (!isNative) return;
    fetchProducts();
  }, []);

  const handleSubscribe = async () => {
    if (!isNative) {
      window.open("https://physiquecrafters.com", "_blank");
      return;
    }

    const plan = plans.find((p) => p.id === selected);
    if (!plan) return;

    setSubscribing(true);
    try {
      // If products weren't loaded on mount, retry before purchasing
      if (!productsLoaded) {
        const loaded = await fetchProducts();
        if (!loaded) {
          toast({
            title: "Unable to connect to App Store",
            description: "Could not load product information. Please check your internet connection and try again.",
            variant: "destructive",
          });
          return;
        }
      }

      // Call purchase with explicit product ID
      await StoreKit.purchase({ productId: plan.productId });

      // If purchase resolved successfully, verify entitlement
      await checkSubscription();
      setSuccessPlan(plan.title);
      setShowSuccess(true);
    } catch (err: any) {
      // User tapped "Cancel" on the Apple payment sheet — NOT an error
      const code = err?.code || err?.message || "";
      const codeStr = String(code).toLowerCase();
      if (
        code === "USER_CANCELLED" ||
        code === "PURCHASE_PENDING" ||
        codeStr.includes("cancel")
      ) {
        // Silent dismiss — do not show error toast
        return;
      }

      // Full diagnostic logging — this is our debugger on device
      console.warn("[Subscribe] Purchase error:", JSON.stringify({
        code: err?.code,
        message: err?.message,
        errorMessage: err?.errorMessage,
        raw: String(err),
      }));

      // Surface the actual native error in the toast for debugging
      const nativeMsg = err?.message || err?.errorMessage || err?.code || String(err);
      let description = `Error: ${nativeMsg}`;

      if (codeStr.includes("invalid") || codeStr.includes("product")) {
        description = `This plan is temporarily unavailable (${nativeMsg}). Please try again later or contact support.`;
      } else if (codeStr.includes("network") || codeStr.includes("connect")) {
        description = "Please check your internet connection and try again.";
      } else if (codeStr.includes("not allowed") || codeStr.includes("restrict")) {
        description = "In-app purchases may be restricted on this device. Check Settings → Screen Time.";
      }

      toast({
        title: "Unable to complete purchase",
        description,
        variant: "destructive",
      });
    } finally {
      setSubscribing(false);
    }
  };

  const handleRestore = async () => {
    if (!isNative) {
      toast({ title: "Not available", description: "Restore is available in the iOS app." });
      return;
    }
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        setSuccessPlan("your plan");
        setShowSuccess(true);
      } else {
        toast({ title: "No active subscriptions found" });
      }
    } catch {
      toast({ title: "Restore failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground flex flex-col safe-top safe-bottom">
      <div className="p-4">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 px-4 pb-8 max-w-md mx-auto w-full space-y-6 overflow-y-auto">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold tracking-wider">
            <span className="text-foreground">PHYSIQUE </span>
            <span className="text-primary">CRAFTERS</span>
          </h1>
          <p className="text-muted-foreground text-sm">Choose Your Plan</p>
          <p className="text-muted-foreground text-[11px]">All prices in USD. Final price in your local currency will be shown at checkout.</p>
        </div>

        <div className="space-y-3">
          {plans.map((plan) => {
            const isSelected = selected === plan.id;
            return (
              <button
                key={plan.id}
                onClick={() => setSelected(plan.id)}
                className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-[0_0_20px_hsl(43_72%_55%/0.15)]"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-foreground">{plan.title}</span>
                  <span className="text-primary font-bold">{plan.price}</span>
                </div>
                <span className="text-[10px] text-muted-foreground block mb-2">{plan.duration}</span>
                {plan.badge && (
                  <span className="inline-block text-[10px] font-bold border border-primary/50 text-primary px-2 py-0.5 rounded-full mb-2">
                    {plan.badge}
                  </span>
                )}
                <div className="space-y-1.5">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <Button
          onClick={handleSubscribe}
          disabled={subscribing}
          className="w-full h-12 bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90"
        >
          {subscribing && <Loader2 className="animate-spin mr-2 h-5 w-5" />}
          Subscribe Now
        </Button>

        <button
          onClick={handleRestore}
          disabled={restoring}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {restoring ? "Restoring…" : "Restore Purchases"}
        </button>

        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          All prices are listed in USD. Subscriptions automatically renew unless canceled at least 24
          hours before the end of the current period. Weekly Updates is billed monthly ($499.99 USD/month).
          Bi-Weekly Updates is billed monthly ($399.00 USD/month). No long-term commitment required — cancel anytime.
          Payment will be charged to your Apple ID account at confirmation of purchase. You can
          manage or cancel your subscription in your Apple ID Account Settings.
        </p>

        <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
          <a href="/terms-of-service" className="underline hover:text-foreground">
            Terms of Use
          </a>
          <span>|</span>
          <a href="/privacy-policy" className="underline hover:text-foreground">
            Privacy Policy
          </a>
        </div>
      </div>

      {showSuccess && <SuccessOverlay planName={successPlan} onDismiss={() => setShowSuccess(false)} />}
    </div>
  );
};

export default Subscribe;
