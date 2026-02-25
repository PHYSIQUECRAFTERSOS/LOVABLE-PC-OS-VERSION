import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, MessageSquare, CheckSquare, Flame } from "lucide-react";
import { format, subDays } from "date-fns";

const ClientWorkspaceEngagement = ({ clientId }: { clientId: string }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

      const [sessionsRes, checkinsRes, cultureRes] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("completed_at")
          .eq("client_id", clientId)
          .gte("created_at", thirtyDaysAgo),
        supabase
          .from("checkin_submissions")
          .select("status")
          .eq("client_id", clientId)
          .gte("created_at", thirtyDaysAgo),
        supabase
          .from("culture_profiles")
          .select("tier, current_streak, lifetime_avg")
          .eq("user_id", clientId)
          .maybeSingle(),
      ]);

      const sessions = sessionsRes.data || [];
      const completed = sessions.filter((s) => s.completed_at).length;
      const checkins = checkinsRes.data || [];
      const submittedCheckins = checkins.filter((c) => c.status === "submitted").length;

      setData({
        totalSessions: sessions.length,
        completedSessions: completed,
        compliancePct: Math.round((completed / Math.max(sessions.length, 1)) * 100),
        totalCheckins: checkins.length,
        submittedCheckins,
        checkinRate: Math.round((submittedCheckins / Math.max(checkins.length, 1)) * 100),
        tier: cultureRes.data?.tier || "bronze",
        streak: cultureRes.data?.current_streak || 0,
        lifetimeAvg: cultureRes.data?.lifetime_avg || 0,
      });
      setLoading(false);
    };
    load();
  }, [clientId]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground font-medium">30-Day Workout Rate</p>
            <CheckSquare className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold">{data.compliancePct}%</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {data.completedSessions}/{data.totalSessions} sessions completed
          </p>
          <Progress value={data.compliancePct} className="mt-3 h-1.5" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground font-medium">Check-In Rate</p>
            <MessageSquare className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold">{data.checkinRate}%</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {data.submittedCheckins}/{data.totalCheckins} check-ins submitted
          </p>
          <Progress value={data.checkinRate} className="mt-3 h-1.5" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground font-medium">Culture Tier</p>
            <Flame className="h-4 w-4 text-primary" />
          </div>
          <Badge variant="secondary" className="text-sm capitalize">{data.tier}</Badge>
          <p className="text-[11px] text-muted-foreground mt-2">
            Lifetime avg: {data.lifetimeAvg}%
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground font-medium">Current Streak</p>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold">{data.streak} weeks</p>
          <p className="text-[11px] text-muted-foreground mt-1">Consecutive compliant weeks</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientWorkspaceEngagement;
