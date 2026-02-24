import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Zap } from "lucide-react";
import { subDays, format } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";

const ComplianceScore = ({ clientId }: { clientId?: string }) => {
  const { user } = useAuth();
  const targetId = clientId || user?.id;

  const { data, loading } = useDataFetch<{ score: number; streak: number }>({
    queryKey: `compliance-${targetId}`,
    enabled: !!targetId,
    staleTime: 3 * 60 * 1000,
    timeout: 5000,
    fallback: { score: 0, streak: 0 },
    queryFn: async (signal) => {
      if (!targetId) throw new Error("No target");
      const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), "yyyy-MM-dd"));

      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("created_at, completed_at")
        .eq("client_id", targetId)
        .gte("created_at", `${last7Days[0]}T00:00:00`)
        .lte("created_at", `${last7Days[6]}T23:59:59`)
        .abortSignal(signal);

      if (!sessions) return { score: 0, streak: 0 };
      const completed = sessions.filter((s) => s.completed_at).length;
      const score = Math.round((completed / Math.max(sessions.length, 1)) * 100);

      let streak = 0;
      for (let i = 6; i >= 0; i--) {
        if (sessions.some((s) => format(new Date(s.created_at), "yyyy-MM-dd") === last7Days[i] && s.completed_at)) streak++;
        else break;
      }
      return { score, streak };
    },
  });

  if (loading) return <CardSkeleton lines={2} />;

  const { score, streak } = data || { score: 0, streak: 0 };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Compliance Score</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-bold text-foreground">{score}%</p>
            <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
          </div>
          <div className="flex items-center gap-2 text-primary font-bold"><Zap className="h-4 w-4" />{streak} day streak</div>
        </div>
        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all" style={{ width: `${score}%` }} />
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplianceScore;
