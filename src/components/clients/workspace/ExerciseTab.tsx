import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dumbbell, Trophy } from "lucide-react";
import { format } from "date-fns";

const ClientWorkspaceExercise = ({ clientId }: { clientId: string }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [prs, setPrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [sessionsRes, prsRes] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("id, workout_id, created_at, completed_at, workouts(name)")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("personal_records")
          .select("id, exercise_id, weight, reps, logged_at, exercises(name)")
          .eq("client_id", clientId)
          .order("logged_at", { ascending: false })
          .limit(10),
      ]);
      setSessions(sessionsRes.data || []);
      setPrs(prsRes.data || []);
      setLoading(false);
    };
    load();
  }, [clientId]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Recent PRs */}
      {prs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Recent PRs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {prs.map((pr: any) => (
              <div key={pr.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{(pr.exercises as any)?.name || "Exercise"}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(pr.logged_at), "MMM d, yyyy")}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {pr.weight} lbs × {pr.reps}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Sessions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            Recent Workouts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No workout sessions yet.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{(s.workouts as any)?.name || "Workout"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(s.created_at), "MMM d, h:mm a")}
                    </p>
                  </div>
                  <Badge variant={s.completed_at ? "default" : "outline"} className="text-[10px]">
                    {s.completed_at ? "Completed" : "In Progress"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientWorkspaceExercise;
