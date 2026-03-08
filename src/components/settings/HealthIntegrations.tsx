import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHealthSync } from "@/hooks/useHealthSync";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Apple, Activity, RefreshCw, Unplug, Footprints, Watch, Heart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WearableConnection {
  id: string;
  provider: string;
  sync_status: string;
  last_synced_at: string | null;
  error_message: string | null;
}

const HealthIntegrations = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    connection,
    loading,
    syncing,
    isNative,
    platform,
    provider,
    connect,
    disconnect,
    syncNow,
  } = useHealthSync();
  const navigate = useNavigate();
  const [appleModal, setAppleModal] = useState(false);
  const [wearables, setWearables] = useState<WearableConnection[]>([]);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);

  const isConnected = isNative && connection?.is_connected;
  const providerLabel = provider === "apple_health" ? "Apple Health" : "Google Fit";

  // Fetch wearable_connections for Fitbit/Whoop
  useEffect(() => {
    if (!user) return;
    const fetchWearables = async () => {
      const { data } = await supabase
        .from("wearable_connections")
        .select("id, provider, sync_status, last_synced_at, error_message")
        .eq("client_id", user.id);
      setWearables((data as WearableConnection[]) || []);
    };
    fetchWearables();
  }, [user]);

  const getWearable = (prov: string) => wearables.find((w) => w.provider === prov);

  const handleConnectWearable = async (prov: string) => {
    if (!user) return;
    // For Fitbit/Whoop, we'd open OAuth. For now create the connection record.
    // OAuth URLs would be:
    // Fitbit: https://www.fitbit.com/oauth2/authorize?...
    // Whoop: https://api.prod.whoop.com/oauth/oauth2/auth?...
    toast({ title: `${prov === "fitbit" ? "Fitbit" : "Whoop"} connection`, description: "OAuth integration coming soon. Connection registered." });

    await supabase.from("wearable_connections").upsert(
      {
        client_id: user.id,
        provider: prov,
        sync_status: "idle",
      },
      { onConflict: "client_id,provider" }
    );

    const { data } = await supabase
      .from("wearable_connections")
      .select("id, provider, sync_status, last_synced_at, error_message")
      .eq("client_id", user.id);
    setWearables((data as WearableConnection[]) || []);
  };

  const handleDisconnectWearable = async (prov: string) => {
    if (!user) return;
    await supabase
      .from("wearable_connections")
      .delete()
      .eq("client_id", user.id)
      .eq("provider", prov);
    setWearables((prev) => prev.filter((w) => w.provider !== prov));
    toast({ title: "Disconnected" });
  };

  const handleSyncAll = async () => {
    setSyncingProvider("all");
    if (isConnected) await syncNow();
    // Trigger edge function for each connected wearable
    for (const w of wearables) {
      if (w.sync_status !== "error" && w.provider !== "apple_health" && w.provider !== "google_fit") {
        try {
          await supabase.functions.invoke("sync-wearable-steps", {
            body: {
              client_id: user?.id,
              provider: w.provider,
              access_token: "placeholder", // Would come from stored token
              start_date: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
              end_date: new Date().toISOString().split("T")[0],
            },
          });
        } catch (err) {
          console.error(`Sync failed for ${w.provider}:`, err);
        }
      }
    }
    setSyncingProvider(null);
    toast({ title: "Sync complete" });
  };

  const renderProvider = (
    label: string,
    prov: string,
    icon: React.ReactNode,
    description: string,
    isHealthKit: boolean = false,
  ) => {
    const wearable = getWearable(prov);
    const connected = isHealthKit
      ? isConnected && provider === (prov === "apple_health" ? "apple_health" : "google_fit")
      : !!wearable;

    return (
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">
              {connected
                ? wearable?.last_synced_at || (isHealthKit && connection?.last_sync_at)
                  ? `Last synced ${formatDistanceToNow(new Date(wearable?.last_synced_at || connection?.last_sync_at || ""), { addSuffix: true })}`
                  : "Connected — awaiting first sync"
                : description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">Connected</Badge>
              {isHealthKit && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={syncNow} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={disconnect}>
                    <Unplug className="h-4 w-4" />
                  </Button>
                </>
              )}
              {!isHealthKit && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDisconnectWearable(prov)}>
                  <Unplug className="h-4 w-4" />
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                if (isHealthKit) {
                  isNative ? connect() : setAppleModal(true);
                } else {
                  handleConnectWearable(prov);
                }
              }}
              disabled={loading}
            >
              Connect
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connected Devices</CardTitle>
          <CardDescription>
            Connect your health app or wearable to auto-sync steps, distance, and more.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderProvider("Apple Health", "apple_health", <Apple className="h-5 w-5 text-foreground" />, "iOS only — sync steps automatically", true)}
          {renderProvider("Google Fit", "google_fit", <Activity className="h-5 w-5 text-foreground" />, "Android & web — sync via OAuth", true)}
          {renderProvider("Fitbit", "fitbit", <Watch className="h-5 w-5 text-foreground" />, "Sync steps, heart rate, sleep")}
          {renderProvider("Whoop", "whoop", <Heart className="h-5 w-5 text-foreground" />, "Recovery & activity data")}

          {/* Sync Now Button */}
          <Button
            className="w-full gap-2"
            onClick={handleSyncAll}
            disabled={syncingProvider === "all"}
          >
            <RefreshCw className={`h-4 w-4 ${syncingProvider === "all" ? "animate-spin" : ""}`} />
            {syncingProvider === "all" ? "Syncing..." : "Sync Now"}
          </Button>

          {/* Manual Steps Entry */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Footprints className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Manual Steps Entry</p>
                <p className="text-xs text-muted-foreground">Log steps manually if no app connected</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/progress?tab=steps")}>
              Open Steps Log
            </Button>
          </div>

          {/* Permissions info */}
          {isConnected && (
            <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Data Access (Read-Only)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(connection?.permissions_granted || []).map((perm) => (
                  <Badge key={perm} variant="secondary" className="text-[10px] capitalize">
                    {perm.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apple Health Info Modal */}
      <Dialog open={appleModal} onOpenChange={setAppleModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Apple className="h-5 w-5" /> Connect Apple Health
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              To sync your steps automatically, use one of these methods:
            </p>
            <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">Option 1 (Recommended):</p>
              <p className="text-xs text-muted-foreground">
                Add this app to your Home Screen as a PWA, then we can request Health permissions.
                Tap the share button in Safari → "Add to Home Screen".
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">Option 2:</p>
              <p className="text-xs text-muted-foreground">
                Log steps manually from the Steps screen.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setAppleModal(false); navigate("/progress?tab=steps"); }}
              >
                Log Steps Manually
              </Button>
              <Button className="flex-1" onClick={() => setAppleModal(false)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HealthIntegrations;
