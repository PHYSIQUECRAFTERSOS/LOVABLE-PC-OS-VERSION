import { useState } from "react";
import type { OnboardingData } from "@/pages/Onboarding";
import { Footprints, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
}

const OnboardingHealthSync = ({ data, updateField }: Props) => {
  const [permissionState, setPermissionState] = useState<"idle" | "granted" | "denied">(
    data.health_sync_status === "connected" ? "granted" : "idle"
  );
  const [requesting, setRequesting] = useState(false);

  const requestMotionPermission = async () => {
    setRequesting(true);
    try {
      if (
        typeof DeviceMotionEvent !== "undefined" &&
        typeof (DeviceMotionEvent as any).requestPermission === "function"
      ) {
        // Race the permission request against a 5-second timeout
        const permissionPromise = (DeviceMotionEvent as any).requestPermission() as Promise<string>;
        const timeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Permission request timed out")), 5000)
        );
        let permission: string;
        try {
          permission = await Promise.race([permissionPromise, timeoutPromise]);
        } catch {
          // Timeout or other failure — treat as denied
          setPermissionState("denied");
          updateField("health_sync_status", "skipped");
          return;
        }
        if (permission === "granted") {
          setPermissionState("granted");
          updateField("health_sync_status", "connected");
        } else {
          setPermissionState("denied");
          updateField("health_sync_status", "skipped");
        }
      } else {
        // Non-iOS or older browser — motion events don't require permission
        setPermissionState("granted");
        updateField("health_sync_status", "connected");
      }
    } catch {
      setPermissionState("denied");
      updateField("health_sync_status", "skipped");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Step Tracking</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Physique Crafters tracks your daily steps to help your coach monitor your activity.
          We'll use your phone's motion sensor to count steps automatically.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Footprints className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Automatic Step Counting</p>
            <p className="text-xs text-muted-foreground">Uses your device's motion sensor</p>
          </div>
        </div>

        {permissionState === "granted" ? (
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-primary">Step tracking enabled</p>
          </div>
        ) : permissionState === "denied" ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <p className="text-sm text-primary">Automatic tracking unavailable on this device</p>
            </div>
            <p className="text-xs text-muted-foreground">
              You can enter your steps manually each day from your dashboard.
              Your coach will still be able to see your progress.
            </p>
          </div>
        ) : (
          <Button
            onClick={requestMotionPermission}
            className="w-full"
            size="lg"
            disabled={requesting}
          >
            <Footprints className="h-5 w-5 mr-2" />
            Enable Step Tracking
          </Button>
        )}

        {permissionState === "idle" && (
          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground"
            onClick={() => {
              setPermissionState("denied");
              updateField("health_sync_status", "skipped");
            }}
          >
            Skip for now — I'll enter steps manually
          </Button>
        )}
      </div>
    </div>
  );
};

export default OnboardingHealthSync;
