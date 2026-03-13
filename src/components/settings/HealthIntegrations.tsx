import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, RefreshCw, Unplug, Footprints, Watch, Heart, Smartphone, ExternalLink, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface WearableConnection {
  id: string;
  provider: string;
  sync_status: string;
  last_synced_at: string | null;
  error_message: string | null;
  access_token: string | null;
}

const HealthIntegrations = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [wearables, setWearables] = useState<WearableConnection[]>([]);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  // Fetch wearable connections
  const fetchWearables = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("wearable_connections")
      .select("id, provider, sync_status, last_synced_at, error_message, access_token")
      .eq("client_id", user.id);
    setWearables((data as WearableConnection[]) || []);
  }, [user]);

  useEffect(() => { fetchWearables(); }, [fetchWearables]);

  // Handle OAuth callback params (code + state from redirect)
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthProvider = searchParams.get("oauth_provider");

    if (code && state && oauthProvider) {
      handleOAuthCallback(oauthProvider, code, state);
      // Clean URL params
      searchParams.delete("code");
      searchParams.delete("state");
      searchParams.delete("oauth_provider");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOAuthCallback = async (provider: string, code: string, state: string) => {
    setConnectingProvider(provider);
    try {
      const fnName = provider === "fitbit" ? "fitbit-auth-callback" : "google-fit-auth-callback";
      const redirectUri = `${window.location.origin}/profile?oauth_provider=${provider}`;

      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { code, state, redirect_uri: redirectUri },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: `${provider === "fitbit" ? "Fitbit" : "Google Fit"} connected!`, description: "Your data is syncing now." });
      await fetchWearables();
    } catch (err: any) {
      console.error(`OAuth callback failed for ${provider}:`, err);
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    } finally {
      setConnectingProvider(null);
    }
  };

  const getWearable = (prov: string) => wearables.find((w) => w.provider === prov);
  const isReallyConnected = (prov: string) => {
    const w = getWearable(prov);
    return w && w.access_token && w.sync_status === "connected";
  };

  const handleConnectOAuth = async (provider: string) => {
    if (!user) return;
    setConnectingProvider(provider);
    try {
      const fnName = provider === "fitbit" ? "fitbit-auth-start" : "google-fit-auth-start";
      const redirectUri = `${window.location.origin}/profile?oauth_provider=${provider}`;

      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { redirect_uri: redirectUri },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Redirect to provider's OAuth page
      window.location.href = data.url;
    } catch (err: any) {
      console.error(`OAuth start failed for ${provider}:`, err);
      const msg = err.message?.includes("not configured")
        ? `${provider === "fitbit" ? "Fitbit" : "Google Fit"} integration is not set up yet. Contact your coach.`
        : err.message;
      toast({ title: "Connection failed", description: msg, variant: "destructive" });
      setConnectingProvider(null);
    }
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

  const handleSyncProvider = async (prov: string) => {
    if (!user) return;
    setSyncingProvider(prov);
    try {
      const w = getWearable(prov);
      if (!w?.access_token) throw new Error("No access token");

      const { data, error } = await supabase.functions.invoke("sync-wearable-steps", {
        body: {
          client_id: user.id,
          provider: prov,
          access_token: w.access_token,
          start_date: new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
          end_date: new Date().toISOString().split("T")[0],
        },
      });
      if (error) throw error;
      toast({ title: "Sync complete", description: `${data?.records_synced || 0} days synced` });
      await fetchWearables();
    } catch (err: any) {
      console.error(`Sync failed for ${prov}:`, err);
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingProvider("all");
    for (const w of wearables) {
      if (isReallyConnected(w.provider)) {
        await handleSyncProvider(w.provider);
      }
    }
    setSyncingProvider(null);
  };

  const renderOAuthProvider = (
    label: string,
    prov: string,
    icon: React.ReactNode,
    description: string,
  ) => {
    const connected = isReallyConnected(prov);
    const wearable = getWearable(prov);
    const connecting = connectingProvider === prov;
    const syncing = syncingProvider === prov || syncingProvider === "all";

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
                ? wearable?.last_synced_at
                  ? `Last synced ${formatDistanceToNow(new Date(wearable.last_synced_at), { addSuffix: true })}`
                  : "Connected — awaiting first sync"
                : description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">Connected</Badge>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSyncProvider(prov)} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDisconnectWearable(prov)}>
                <Unplug className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => handleConnectOAuth(prov)} disabled={connecting}>
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderNativeOnlyProvider = (
    label: string,
    icon: React.ReactNode,
    description: string,
  ) => (
    <div className="flex items-center justify-between rounded-lg border border-border p-4 opacity-60">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Badge variant="secondary" className="text-xs">Native App Only</Badge>
    </div>
  );

  const renderComingSoon = (
    label: string,
    icon: React.ReactNode,
    description: string,
  ) => (
    <div className="flex items-center justify-between rounded-lg border border-border p-4 opacity-60">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
    </div>
  );

  const hasAnyConnection = wearables.some((w) => isReallyConnected(w.provider));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Connected Devices</CardTitle>
        <CardDescription>
          Connect your health app or wearable to auto-sync steps, heart rate, and more.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* OAuth-based integrations */}
        {renderOAuthProvider("Fitbit", "fitbit", <Watch className="h-5 w-5 text-foreground" />, "Sync steps, heart rate & sleep via Fitbit")}
        {renderOAuthProvider("Google Fit", "google_fit", <Activity className="h-5 w-5 text-foreground" />, "Sync steps & activity via Google Fit")}

        {/* Native-only */}
        {renderNativeOnlyProvider("Apple Health", <Smartphone className="h-5 w-5 text-foreground" />, "Requires native iOS app (not available in PWA)")}

        {/* Coming soon */}
        {renderComingSoon("Whoop", <Heart className="h-5 w-5 text-foreground" />, "Recovery & strain data — API integration coming soon")}

        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-lg bg-secondary/50 p-3">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Apple Health requires a native iOS app built with Xcode. It cannot be accessed from a web browser or PWA.
            Use Fitbit or Google Fit for automatic step syncing, or log steps manually below.
          </p>
        </div>

        {/* Sync All */}
        {hasAnyConnection && (
          <Button className="w-full gap-2" onClick={handleSyncAll} disabled={syncingProvider === "all"}>
            <RefreshCw className={`h-4 w-4 ${syncingProvider === "all" ? "animate-spin" : ""}`} />
            {syncingProvider === "all" ? "Syncing..." : "Sync All Devices"}
          </Button>
        )}

        {/* Manual Steps Entry */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <Footprints className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Manual Steps Entry</p>
              <p className="text-xs text-muted-foreground">Log steps manually if no device connected</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/progress?tab=steps")}>
            Open Steps Log
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default HealthIntegrations;
