import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/useSubscription";
import { Capacitor } from "@capacitor/core";
import StoreKit from "@/plugins/StoreKitPlugin";
import SuccessOverlay from "@/components/subscription/SuccessOverlay";

interface Plan {
  id: string;
  productId: string;
  title: string;
  price: string;
  badge?: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: "weekly",
    productId: "com.physiquecrafters.app.monthly",
    title: "Weekly Updates",
    price: "$399.99/mo",
    badge: "MOST POPULAR",
    features: [
      "Weekly progress updates",
      "Customized Training Program",
      "Customized Meal Plan",
      "Customized Supplement Plan",
    ],
  },
  {
    id: "biweekly",
    productId: "com.physiquecrafters.app.biweekly",
    title: "Bi-Weekly Updates",
    price: "$299.99/mo",
    features: [
      "Bi-Weekly progress updates",
      "Customized Training Program",
      "Customized Meal Plan",
      "Customized Supplement Plan",
    ],
  },
  {
    id: "training",
    productId: "com.physiquecrafters.app.training",
    title: "Training Only",
    price: "$174.99/2mo",
    features: ["Customized Training Program"],
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

  const handleSubscribe = async () => {
    if (!isNative) {
      window.open("https://physiquecrafters.com", "_blank");
      return;
    }

    setSubscribing(true);
    try {
      await StoreKit.showPaywall();
      const result = await StoreKit.checkSubscription();
      if (result.hasSubscription) {
        await checkSubscription();
        const plan = PLANS.find((p) => p.id === selected);
        setSuccessPlan(plan?.title || "your plan");
        setShowSuccess(true);
      }
    } catch (err: any) {
      console.error("Subscription error:", err);
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
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
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col safe-top safe-bottom">
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
        </div>

        <div className="space-y-3">
          {PLANS.map((plan) => {
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
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-foreground">{plan.title}</span>
                  <span className="text-primary font-bold">{plan.price}</span>
                </div>
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
          Payment will be charged to your Apple ID account at confirmation of purchase. Subscription
          automatically renews unless canceled at least 24 hours before the end of the current period.
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
