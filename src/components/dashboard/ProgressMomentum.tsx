import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Scale, Dumbbell, Footprints } from "lucide-react";
import { format, subDays } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";
import { cn } from "@/lib/utils";

interface MomentumData {
  weightChange: number | null;
  currentWeight: number | null;
  workoutCompletion: number;
  stepAvg: number;
}

const ProgressMomentum = () => {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const thirtyDaysAgo = format(subDays(new Date(), 29), "yyyy-MM-dd");
  const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");

  const { data, loading } = useDataFetch<MomentumData>({
    queryKey: `progress-momentum-${user?.id}-${today}`,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    timeout: 5000,
    fallback: { weightChange: null, currentWeight: null, workoutCompletion: 0, stepAvg: 0 },
    queryFn: async (signal) => {
      if (!user) throw new Error("No user");

      const [weightsRes, sessionsRes, metricsRes] = await Promise.all([
        supabase
          .from("weight_logs")
          .select("weight, logged_at")
          .eq("client_id", user.id)
          .gte("logged_at", thirtyDaysAgo)
          .order("logged_at", { ascending: true })
          .abortSignal(signal),
        supabase
          .from("workout_sessions")
          .select("completed_at")
          .eq("client_id", user.id)
          .gte("created_at", `${sevenDaysAgo}T00:00:00`)
          .abortSignal(signal),
        supabase
          .from("daily_health_metrics")
          .select("steps")
          .eq("user_id", user.id)
          .gte("metric_date", sevenDaysAgo)
          .abortSignal(signal),
      ]);

      const weights = weightsRes.data || [];
      let weightChange: number | null = null;
      let currentWeight: number | null = null;
      if (weights.length >= 2) {
        currentWeight = weights[weights.length - 1].weight;
        weightChange = Math.round((currentWeight - weights[0].weight) * 10) / 10;
      } else if (weights.length === 1) {
        currentWeight = weights[0].weight;
      }

      const sessions = sessionsRes.data || [];
      const workoutCompletion = sessions.length > 0
        ? Math.round((sessions.filter((s) => s.completed_at).length / sessions.length) * 100)
        : 0;

      const metrics = metricsRes.data || [];
      const stepsWithData = metrics.filter((m) => m.steps && m.steps > 0);
      const stepAvg = stepsWithData.length > 0
        ? Math.round(stepsWithData.reduce((sum, m) => sum + (m.steps || 0), 0) / stepsWithData.length)
        : 0;

      return { weightChange, currentWeight, workoutCompletion, stepAvg };
    },
  });

  if (loading) return <CardSkeleton lines={3} />;

  const { weightChange, currentWeight, workoutCompletion, stepAvg } = data || {
    weightChange: null, currentWeight: null, workoutCompletion: 0, stepAvg: 0,
  };

  const metrics = [
    {
      icon: <Scale className="h-4 w-4" />,
      label: "Weight (30d)",
      value: weightChange !== null
        ? `${weightChange > 0 ? "+" : ""}${weightChange} lbs`
        : "No data",
      sub: currentWeight ? `${currentWeight} lbs` : undefined,
      trend: weightChange !== null ? (weightChange < 0 ? "down" : weightChange > 0 ? "up" : "flat") : null,
    },
    {
      icon: <Dumbbell className="h-4 w-4" />,
      label: "Workouts (7d)",
      value: `${workoutCompletion}%`,
      trend: workoutCompletion >= 80 ? "up" : workoutCompletion >= 50 ? "flat" : "down",
    },
    {
      icon: <Footprints className="h-4 w-4" />,
      label: "Avg Steps (7d)",
      value: stepAvg > 0 ? stepAvg.toLocaleString() : "No data",
      sub: stepAvg > 0 ? "/day" : undefined,
      trend: stepAvg >= 8000 ? "up" : stepAvg >= 5000 ? "flat" : stepAvg > 0 ? "down" : null,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Progress Momentum
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0 shrink-0">
              {m.icon}
              <span className="text-xs whitespace-nowrap">{m.label}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-sm font-bold text-foreground whitespace-nowrap">{m.value}</span>
              {m.sub && <span className="text-xs text-muted-foreground whitespace-nowrap">{m.sub}</span>}
              {m.trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-green-500 shrink-0" />}
              {m.trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-400 shrink-0" />}
              {m.trend === "flat" && <Minus className="h-3.5 w-3.5 text-yellow-500 shrink-0" />}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default ProgressMomentum;
