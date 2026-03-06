import { useState } from "react";
import { useHealthSync } from "@/hooks/useHealthSync";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Apple, Activity, RefreshCw, Unplug, Footprints } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const HealthIntegrations = () => {
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

  const isConnected = isNative && connection?.is_connected;

  const providerLabel = provider === "apple_health" ? "Apple Health" : "Google Fit";
  const ProviderIcon = provider === "apple_health" ? Apple : Activity;

  const handleConnect = () => {
    if (isNative) {
      connect();
    } else if (platform === "web") {
      // Show Apple Health info modal for web users
      setAppleModal(true);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Health Integrations</CardTitle>
          <CardDescription>
            Connect your health app to auto-sync steps, distance, and more.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Apple Health */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Apple className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Apple Health</p>
                <p className="text-xs text-muted-foreground">
                  {isConnected && provider === "apple_health"
                    ? connection?.last_sync_at
                      ? `Last synced ${formatDistanceToNow(new Date(connection.last_sync_at), { addSuffix: true })}`
                      : "Connected — awaiting first sync"
                    : "iOS only — sync steps automatically"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected && provider === "apple_health" ? (
                <>
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary">Connected</Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={syncNow} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={disconnect}>
                    <Unplug className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => isNative && provider === "apple_health" ? connect() : setAppleModal(true)} disabled={loading}>
                  Connect
                </Button>
              )}
            </div>
          </div>

          {/* Google Fit */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Activity className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Google Fit</p>
                <p className="text-xs text-muted-foreground">
                  {isConnected && provider === "google_fit"
                    ? connection?.last_sync_at
                      ? `Last synced ${formatDistanceToNow(new Date(connection.last_sync_at), { addSuffix: true })}`
                      : "Connected — awaiting first sync"
                    : "Android & web — sync via OAuth"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected && provider === "google_fit" ? (
                <>
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary">Connected</Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={syncNow} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={disconnect}>
                    <Unplug className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => isNative && provider === "google_fit" ? connect() : setAppleModal(true)} disabled={loading}>
                  Connect
                </Button>
              )}
            </div>
          </div>

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
