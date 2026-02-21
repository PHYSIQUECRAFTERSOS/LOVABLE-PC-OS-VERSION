import type { OnboardingData } from "@/pages/Onboarding";
import { Apple, Activity, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHealthSync } from "@/hooks/useHealthSync";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
}

const OnboardingHealthSync = ({ data, updateField }: Props) => {
  const { isNative, platform, connect, connection } = useHealthSync();
  const isConnected = connection?.is_connected || data.health_sync_status === "connected";

  const handleConnect = async () => {
    await connect();
    updateField("health_sync_status", "connected");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Connect Your Health Data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your program accuracy improves significantly when step and energy data are synced.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Activity className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Improve Accuracy</p>
            <p className="text-xs text-muted-foreground">Steps • Active calories • Resting HR • Weight</p>
          </div>
        </div>

        {isConnected ? (
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
            <p className="text-sm font-medium text-primary">✓ Health data connected</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(isNative || true) && (
              <>
                {(platform === "ios" || !isNative) && (
                  <Button onClick={handleConnect} className="w-full" size="lg">
                    <Apple className="h-5 w-5 mr-2" />
                    Connect Apple Health
                  </Button>
                )}
                {(platform === "android" || !isNative) && (
                  <Button onClick={handleConnect} variant="outline" className="w-full" size="lg">
                    <Activity className="h-5 w-5 mr-2" />
                    Connect Google Fit
                  </Button>
                )}
              </>
            )}
            <Button
              variant="ghost"
              className="w-full text-xs text-muted-foreground"
              onClick={() => updateField("health_sync_status", "skipped")}
            >
              <SkipForward className="h-3 w-3 mr-1" />
              Skip for now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingHealthSync;
