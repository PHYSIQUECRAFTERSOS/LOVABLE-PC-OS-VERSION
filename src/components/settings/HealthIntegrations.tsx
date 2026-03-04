import { useHealthSync } from "@/hooks/useHealthSync";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Apple, Activity, RefreshCw, Unplug } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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

  const isConnected = isNative && connection?.is_connected;

  const providerLabel = provider === "apple_health" ? "Apple Health" : "Google Fit";
  const ProviderIcon = provider === "apple_health" ? Apple : Activity;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Health Integrations</CardTitle>
        <CardDescription>
          Connect your health app to auto-sync steps, distance, and more.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider card */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <ProviderIcon className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {providerLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {isConnected
                  ? connection?.last_sync_at
                    ? `Last synced ${formatDistanceToNow(new Date(connection.last_sync_at), { addSuffix: true })}`
                    : "Connected — awaiting first sync"
                  : isNative
                    ? "Tap to connect"
                    : "Available on mobile app"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected && (
              <>
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  Connected
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={syncNow}
                  disabled={syncing}
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={disconnect}
                >
                  <Unplug className="h-4 w-4" />
                </Button>
              </>
            )}
            {!isConnected && (
              <Button size="sm" onClick={connect} disabled={loading}>
                Connect
              </Button>
            )}
          </div>
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

        {!isNative && (
          <p className="text-xs text-muted-foreground/60 text-center">
            Health integrations require the native iOS or Android app.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default HealthIntegrations;
