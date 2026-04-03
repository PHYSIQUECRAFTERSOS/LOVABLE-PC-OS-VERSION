import { useState } from "react";
import { useHealthSync } from "@/hooks/useHealthSync";
import { Button } from "@/components/ui/button";
import { Heart, Activity, Loader2, Check, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

interface Props {
  onComplete: () => void;
}

const OnboardingHealthSyncFull = ({ onComplete }: Props) => {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const healthSync = useHealthSync();
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const isIOS = platform === "ios";
  const providerLabel = isIOS ? "Apple Health" : "Google Fit";
  const ProviderIcon = isIOS ? Smartphone : Activity;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      if (isNative && isIOS) {
        const conn = await healthSync.connect();
        toast.success("Apple Health connected!");
        try {
          await healthSync.syncNow(conn);
        } catch {
          // Initial sync failure is non-critical
        }
        setConnected(true);
      } else {
        // For non-native / Android, skip the full OAuth flow during onboarding
        // and direct them to settings later
        toast.info("You can connect health integrations in Settings after setup.");
        onComplete();
        return;
      }
    } catch (err: any) {
      console.error("[OnboardingHealthSync] Connect failed:", err);
      toast.error("Connection failed. You can connect in Settings later.");
      // Never leave the user stuck — proceed to success screen
      onComplete();
      return;
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center space-y-8">
        {/* Icon */}
        <div className="relative">
          <div className="h-40 w-40 rounded-full border-2 border-dashed border-primary/50 flex items-center justify-center bg-secondary/30">
            {connected ? (
              <Check className="h-16 w-16 text-primary" />
            ) : (
              <Heart className="h-16 w-16 text-muted-foreground/40" />
            )}
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Sync Your Health Data</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Track your steps, calories burned, and activity automatically. Connect your health app so your coach can monitor your progress.
          </p>
        </div>

        {/* Actions */}
        <div className="w-full space-y-3">
          {connected ? (
            <Button
              className="w-full gap-2 h-12 text-base font-semibold"
              onClick={onComplete}
            >
              <Check className="h-5 w-5" />
              CONTINUE
            </Button>
          ) : (
            <Button
              className="w-full gap-2 h-12 text-base font-semibold"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ProviderIcon className="h-5 w-5" />
              )}
              {connecting ? "CONNECTING..." : `CONNECT ${providerLabel.toUpperCase()}`}
            </Button>
          )}

          {!connected && (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={onComplete}
              disabled={connecting}
            >
              Skip
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingHealthSyncFull;
