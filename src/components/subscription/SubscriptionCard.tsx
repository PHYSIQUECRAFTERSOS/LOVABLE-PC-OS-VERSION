import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2 } from "lucide-react";
import { useSubscription, TIER_MAP } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";

const SubscriptionCard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSubscribed, tier, tierLabel, loading, restorePurchases } = useSubscription();

  const handleManage = () => {
    if (Capacitor.isNativePlatform()) {
      window.open("https://apps.apple.com/account/subscriptions", "_blank");
    } else {
      toast({ title: "Manage your subscription in the iOS app" });
    }
  };

  const handleRestore = async () => {
    const restored = await restorePurchases();
    if (restored) {
      toast({ title: "Subscription restored!" });
    } else {
      toast({ title: "No active subscriptions found" });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const renewal = tier ? TIER_MAP[tier]?.renewal : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5 text-primary" />
          {isSubscribed ? "Your Subscription" : "Subscription"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isSubscribed ? (
          <>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{tierLabel}</span>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Active</Badge>
            </div>
            {renewal && <p className="text-xs text-muted-foreground">{renewal}</p>}
            <Button variant="outline" onClick={handleManage} className="w-full border-primary/40 text-primary hover:bg-primary/10">
              Manage Subscription
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Subscribe to unlock all features</p>
            <Button onClick={() => navigate("/subscribe")} className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90">
              Subscribe
            </Button>
          </>
        )}
        <button onClick={handleRestore} className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
          Restore Purchases
        </button>
      </CardContent>
    </Card>
  );
};

export default SubscriptionCard;
