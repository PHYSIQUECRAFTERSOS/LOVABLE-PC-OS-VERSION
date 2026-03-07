import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dumbbell,
  UtensilsCrossed,
  TrendingDown,
  TrendingUp,
  Activity,
  CalendarDays,
  Zap,
  Target,
} from "lucide-react";
import { format, subDays } from "date-fns";

interface SummaryData {
  workoutCompliance: number;
  nutritionCompliance: number;
  currentWeight: number | null;
  weightTrend: "up" | "down" | "stable";
  streak: number;
  lastCheckin: string | null;
  currentPhase: string | null;
  programName: string | null;
  phaseEndDate: string | null;
}

const ClientWorkspaceSummary = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId || !user) return;
    const load = async () => {
      setLoading(true);
      const last7 = Array.from({ length: 7 }, (_, i) =>
        format(subDays(new Date(), i), "yyyy-MM-dd")
      ).reverse();

      const [sessionsRes, weightsRes, checkinRes, assignmentRes] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("created_at, completed_at")
          .eq("client_id", clientId)
          .gte("created_at", `${last7[0]}T00:00:00`),
        supabase
          .from("weight_logs")
          .select("weight, logged_at")
          .eq("client_id", clientId)
          .order("logged_at", { ascending: false })
          .limit(7),
        supabase
          .from("checkin_submissions")
          .select("submitted_at")
          .eq("client_id", clientId)
          .eq("status", "submitted")
          .order("submitted_at", { ascending: false })
          .limit(1),
        supabase
          .from("client_program_assignments")
          .select("current_week_number, program_id, current_phase_id, programs(name), program_phases(name)")
          .eq("client_id", clientId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
      ]);

      const sessions = sessionsRes.data || [];
      const completed = sessions.filter((s) => s.completed_at).length;
      const workoutCompliance = Math.round((completed / Math.max(sessions.length, 1)) * 100);

      let streak = 0;
      for (let i = 6; i >= 0; i--) {
        const dayComplete = sessions.some(
          (s) => format(new Date(s.created_at), "yyyy-MM-dd") === last7[i] && s.completed_at
        );
        if (dayComplete) streak++;
        else break;
      }

      const weights = weightsRes.data || [];
      const currentWeight = weights[0]?.weight || null;
      let weightTrend: "up" | "down" | "stable" = "stable";
      if (weights.length >= 2) {
        const diff = (weights[0] as any).weight - (weights[weights.length - 1] as any).weight;
        weightTrend = diff > 0.2 ? "up" : diff < -0.2 ? "down" : "stable";
      }

      const assignment = assignmentRes.data as any;

      setData({
        workoutCompliance,
        nutritionCompliance: 0, // TODO: calculate from nutrition_logs
        currentWeight,
        weightTrend,
        streak,
        lastCheckin: (checkinRes.data as any)?.[0]?.submitted_at || null,
        currentPhase: assignment?.program_phases?.name || null,
        programName: assignment?.programs?.name || null,
        phaseEndDate: null,
      });
      setLoading(false);
    };
    load();
  }, [clientId, user]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Workout Compliance</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.workoutCompliance}%</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Dumbbell className="h-5 w-5 text-primary" />
              </div>
            </div>
            <Progress value={data.workoutCompliance} className="mt-3 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Current Weight</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {data.currentWeight ? `${data.currentWeight} lbs` : "—"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                {data.weightTrend === "down" ? (
                  <TrendingDown className="h-5 w-5 text-green-500" />
                ) : data.weightTrend === "up" ? (
                  <TrendingUp className="h-5 w-5 text-destructive" />
                ) : (
                  <Activity className="h-5 w-5 text-primary" />
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Trend: <span className="capitalize">{data.weightTrend}</span> (7d)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Current Streak</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.streak}d</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Consecutive training days</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Last Check-In</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {data.lastCheckin
                    ? format(new Date(data.lastCheckin), "MMM d")
                    : "—"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {data.lastCheckin
                ? format(new Date(data.lastCheckin), "h:mm a")
                : "No check-ins yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Program Info */}
      {data.programName && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Active Program
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{data.programName}</p>
                {data.currentPhase && (
                  <Badge variant="secondary" className="mt-1 text-[10px]">
                    {data.currentPhase}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientWorkspaceSummary;
