import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getSyncLog,
  exportSyncLog,
  clearSyncLog,
  getLastOverallSuccess,
  type SyncLogEntry,
  type SyncStatus,
} from "@/lib/syncActivityLog";
import { useHealthSync } from "@/hooks/useHealthSync";
// Read version from package.json at build time
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — vite supports json imports
import pkg from "../../package.json";

const statusBadge = (status: SyncStatus) => {
  const map: Record<SyncStatus, string> = {
    success: "bg-success/15 text-success border-success/30",
    failure: "bg-destructive/15 text-destructive border-destructive/30",
    timeout: "bg-warn/15 text-warn border-warn/30",
    skipped: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${map[status]}`}>
      {status}
    </Badge>
  );
};

const SyncLogDebug = () => {
  const navigate = useNavigate();
  // NOTE: this screen MUST render even when HealthKit is broken.
  // We only read connection state for display; we do NOT call HealthKit on mount.
  const { connection, syncNow } = useHealthSync();
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setEntries(getSyncLog().slice().reverse());
  }, [refreshTick]);

  // Poll every 1s so a live "Run Sync Now" attempt appears in the list
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const lastSuccess = getLastOverallSuccess();
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportSyncLog());
      toast.success("Sync log copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleClear = () => {
    clearSyncLog();
    setRefreshTick((t) => t + 1);
    toast.success("Log cleared");
  };

  const handleRunNow = async () => {
    setSyncing(true);
    try {
      await syncNow(undefined, "manual");
      toast.success("Sync triggered");
    } catch (err: any) {
      // Error is already logged in the activity log — no toast needed
      console.warn("[SyncLogDebug] Manual sync failed:", err);
    } finally {
      setSyncing(false);
      setRefreshTick((t) => t + 1);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold">Sync Activity Log</h1>
      </div>

      <div className="space-y-4 px-4 py-4 pb-24">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Device</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <div>Platform: <span className="text-foreground">{platform}</span></div>
            <div>Native: <span className="text-foreground">{String(isNative)}</span></div>
            <div>App version: <span className="text-foreground">{(pkg as any).version ?? "0.0.0"}</span></div>
            <div>Sync interval: <span className="text-foreground">2h (foreground throttle 30m)</span></div>
            <div>Connection: <span className="text-foreground">{connection?.is_connected ? "connected" : "not connected"}</span></div>
            <div>
              Last overall success:{" "}
              <span className="text-foreground">{lastSuccess?.timestamp ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleRunNow} disabled={syncing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Run Sync Now
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopy} className="gap-2">
            <Copy className="h-4 w-4" /> Copy All
          </Button>
          <Button size="sm" variant="outline" onClick={handleClear} className="gap-2 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> Clear Log
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Events ({entries.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entries.length === 0 && (
              <p className="text-xs text-muted-foreground">No sync events yet. Tap “Run Sync Now”.</p>
            )}
            {entries.map((e, i) => (
              <div key={i} className="rounded-md border border-border bg-card/40 p-3 text-xs">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {statusBadge(e.status)}
                  <span className="font-mono text-foreground">{e.phase}</span>
                  <span className="text-muted-foreground">· {e.trigger}</span>
                  <span className="text-muted-foreground">· {e.durationMs}ms</span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">{e.timestamp}</div>
                <div className="mt-1 break-words font-mono text-[11px] text-foreground/90">
                  {e.detail}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SyncLogDebug;
