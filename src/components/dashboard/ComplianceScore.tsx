import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Zap } from "lucide-react";
import { subDays, format } from "date-fns";

const ComplianceScore = ({ clientId }: { clientId?: string }) => {
  const { user } = useAuth();
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const targetId = clientId || user?.id;

  useEffect(() => {
    if (!targetId) return;
    const fetch = async () => {
      const last7Days = Array.from({ length: 7 }, (_, i) =>
        format(subDays(new Date(), i), "yyyy-MM-dd")
      ).reverse();

      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("created_at, completed_at")
        .eq("client_id", targetId)
        .gte("created_at", `${last7Days[0]}T00:00:00`)
        .lte("created_at", `${last7Days[6]}T23:59:59`);

      if (sessions) {
        const completed = sessions.filter((s) => s.completed_at).length;
        setScore(Math.round((completed / Math.max(sessions.length, 1)) * 100));

        // Calculate streak
        let currentStreak = 0;
        for (let i = 6; i >= 0; i--) {
          const dayComplete = sessions.some((s) => format(new Date(s.created_at), "yyyy-MM-dd") === last7Days[i] && s.completed_at);
          if (dayComplete) currentStreak++;
          else break;
        }
        setStreak(currentStreak);
      }
    };
    fetch();
  }, [targetId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Compliance Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-bold text-foreground">{score}%</p>
            <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
          </div>
          <div className="flex items-center gap-2 text-primary font-bold">
            <Zap className="h-4 w-4" />
            {streak} day streak
          </div>
        </div>
        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all" style={{ width: `${score}%` }} />
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplianceScore;
