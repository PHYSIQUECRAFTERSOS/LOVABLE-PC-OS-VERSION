import { useHealthSync } from "@/hooks/useHealthSync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Footprints, RefreshCw, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { getLocalDateString } from "@/utils/localDate";

const StepsCard = () => {
  const {
    connection,
    todayMetrics,
    weekMetrics,
    loading,
    syncing,
    isNative,
    syncNow,
  } = useHealthSync();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 bg-secondary/50 rounded" />
        </CardContent>
      </Card>
    );
  }

  const isConnected = isNative && connection?.is_connected;
  const steps = todayMetrics?.steps ?? 0;
  const goal = todayMetrics?.step_goal ?? 10000;
  const progressPct = Math.min((steps / goal) * 100, 100);

  // 7-day data for mini trend
  const maxSteps = Math.max(...weekMetrics.map((d) => d.steps ?? 0), 1);

  if (!isConnected) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center gap-3">
          <Smartphone className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Connect Apple Health or Google Fit to auto-sync steps
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/profile")}
          >
            Connect Now
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Footprints className="h-4 w-4" />
          Today's Steps
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => syncNow()}
          disabled={syncing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Main step count */}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground tabular-nums">
            {steps.toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">
            / {goal.toLocaleString()}
          </span>
        </div>

        {/* Progress bar */}
        <Progress value={progressPct} className="h-2" />

        {/* 7-day trend mini bars */}
        {weekMetrics.length > 0 && (
          <div className="flex items-end gap-1 h-10 pt-1">
            {weekMetrics.map((day) => {
              const daySteps = day.steps ?? 0;
              const height = Math.max((daySteps / maxSteps) * 100, 4);
              const isToday = day.metric_date === getLocalDateString();
              return (
                <div
                  key={day.metric_date}
                  className="flex-1 rounded-sm transition-all"
                  style={{
                    height: `${height}%`,
                    backgroundColor: isToday
                      ? "hsl(var(--primary))"
                      : "hsl(var(--muted-foreground) / 0.3)",
                  }}
                  title={`${new Date(day.metric_date).toLocaleDateString("en-US", { weekday: "short" })}: ${daySteps.toLocaleString()} steps`}
                />
              );
            })}
          </div>
        )}

        {/* Last synced */}
        {connection?.last_sync_at && (
          <p className="text-[10px] text-muted-foreground/60">
            Last synced{" "}
            {formatDistanceToNow(new Date(connection.last_sync_at), {
              addSuffix: true,
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default StepsCard;
