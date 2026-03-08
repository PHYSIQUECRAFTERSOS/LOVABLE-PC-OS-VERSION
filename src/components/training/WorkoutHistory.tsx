import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, Dumbbell, Trophy, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface SessionRow {
  id: string;
  workout_id: string;
  completed_at: string | null;
  created_at: string;
  notes: string | null;
  workoutName: string;
  workoutPhase: string | null;
  exerciseLogs: ExerciseLogRow[];
  exerciseModifications: any[];
}

interface ExerciseLogRow {
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  tempo: string | null;
}

interface PRRow {
  exercise_id: string;
  exercise_name: string;
  weight: number;
  reps: number;
  logged_at: string;
}

interface VolumeTrend {
  date: string;
  totalVolume: number;
  totalSets: number;
}

interface ExerciseVolumeTrend {
  exerciseId: string;
  exerciseName: string;
  data: { date: string; volume: number; maxWeight: number }[];
}

const WorkoutHistory = () => {
  const { user, role } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [prs, setPrs] = useState<PRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [exerciseTrends, setExerciseTrends] = useState<ExerciseVolumeTrend[]>([]);
  const [sessionTrends, setSessionTrends] = useState<VolumeTrend[]>([]);

  useEffect(() => {
    if (!user) return;
    loadHistory();
  }, [user]);

  const loadHistory = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load completed sessions
      const { data: sessionsData } = await supabase
        .from("workout_sessions")
        .select("id, workout_id, completed_at, created_at, notes, exercise_modifications")
        .eq("client_id", user.id)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(50);

      if (!sessionsData || sessionsData.length === 0) {
        setSessions([]);
        setLoading(false);
        return;
      }

      // Load workout names
      const workoutIds = [...new Set(sessionsData.map(s => s.workout_id))];
      const { data: workouts } = await supabase
        .from("workouts")
        .select("id, name, phase")
        .in("id", workoutIds);

      const workoutMap = new Map((workouts || []).map(w => [w.id, w]));

      // Load all exercise logs for these sessions
      const sessionIds = sessionsData.map(s => s.id);
      const { data: logs } = await supabase
        .from("exercise_logs")
        .select("session_id, exercise_id, set_number, weight, reps, rir, tempo")
        .in("session_id", sessionIds)
        .order("set_number");

      // Load exercise names
      const exerciseIds = [...new Set((logs || []).map(l => l.exercise_id))];
      const { data: exercisesData } = await supabase
        .from("exercises")
        .select("id, name")
        .in("id", exerciseIds.length > 0 ? exerciseIds : ["none"]);

      const exerciseMap = new Map((exercisesData || []).map(e => [e.id, e.name]));

      // Build sessions with logs
      const enrichedSessions: SessionRow[] = sessionsData.map(s => {
        const workout = workoutMap.get(s.workout_id);
        const sessionLogs = (logs || [])
          .filter(l => l.session_id === s.id)
          .map(l => ({
            ...l,
            exercise_name: exerciseMap.get(l.exercise_id) || "Unknown",
          }));

        return {
          ...s,
          workoutName: workout?.name || "Workout",
          workoutPhase: workout?.phase || null,
          exerciseLogs: sessionLogs,
          exerciseModifications: Array.isArray((s as any).exercise_modifications) ? (s as any).exercise_modifications : [],
        };
      });

      setSessions(enrichedSessions);

      // Build session-level volume trends (last 20 sessions, reversed)
      const trendData: VolumeTrend[] = enrichedSessions
        .slice(0, 20)
        .reverse()
        .map(s => ({
          date: format(new Date(s.completed_at!), "MMM d"),
          totalVolume: s.exerciseLogs.reduce((acc, l) => acc + (l.weight || 0) * (l.reps || 0), 0),
          totalSets: s.exerciseLogs.length,
        }));
      setSessionTrends(trendData);

      // Build per-exercise volume trends
      const exerciseGroups = new Map<string, { name: string; entries: { date: string; volume: number; maxWeight: number }[] }>();

      enrichedSessions.forEach(s => {
        const date = format(new Date(s.completed_at!), "MMM d");
        const exerciseVolumes = new Map<string, { volume: number; maxWeight: number }>();

        s.exerciseLogs.forEach(l => {
          const prev = exerciseVolumes.get(l.exercise_id) || { volume: 0, maxWeight: 0 };
          exerciseVolumes.set(l.exercise_id, {
            volume: prev.volume + (l.weight || 0) * (l.reps || 0),
            maxWeight: Math.max(prev.maxWeight, l.weight || 0),
          });

          if (!exerciseGroups.has(l.exercise_id)) {
            exerciseGroups.set(l.exercise_id, { name: l.exercise_name, entries: [] });
          }
        });

        exerciseVolumes.forEach((val, exId) => {
          exerciseGroups.get(exId)?.entries.push({ date, ...val });
        });
      });

      const trends: ExerciseVolumeTrend[] = Array.from(exerciseGroups.entries())
        .filter(([, g]) => g.entries.length >= 2)
        .map(([id, g]) => ({
          exerciseId: id,
          exerciseName: g.name,
          data: g.entries.reverse(),
        }));
      setExerciseTrends(trends);

      // Load PRs
      const { data: prData } = await supabase
        .from("personal_records")
        .select("exercise_id, weight, reps, logged_at")
        .eq("client_id", user.id)
        .order("logged_at", { ascending: false });

      const enrichedPrs: PRRow[] = (prData || []).map(pr => ({
        ...pr,
        exercise_name: exerciseMap.get(pr.exercise_id) || "Unknown",
      }));
      setPrs(enrichedPrs);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            No completed workouts yet. Start a workout to see your history here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Session Volume Trends */}
      {sessionTrends.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" /> Total Volume Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sessionTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalVolume"
                    name="Volume (lbs)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PR Timeline */}
      {prs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-primary" /> Personal Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {prs.map((pr, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Trophy className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{pr.exercise_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(pr.logged_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">{pr.weight} lbs</p>
                    <p className="text-[10px] text-muted-foreground">{pr.reps} reps</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Exercise Volume Trends */}
      {exerciseTrends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Dumbbell className="h-5 w-5" /> Exercise Trends
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {exerciseTrends.map(trend => (
              <div key={trend.exerciseId} className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">{trend.exerciseName}</h4>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line
                        type="monotone"
                        dataKey="maxWeight"
                        name="Max Weight"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="volume"
                        name="Volume"
                        stroke="hsl(200 70% 55%)"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Past Sessions */}
      <div className="space-y-3">
        <h3 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Past Sessions
        </h3>
        {sessions.map(session => {
          const isExpanded = expandedSession === session.id;
          const totalVolume = session.exerciseLogs.reduce(
            (acc, l) => acc + (l.weight || 0) * (l.reps || 0), 0
          );
          const uniqueExercises = new Set(session.exerciseLogs.map(l => l.exercise_id)).size;

          return (
            <Card key={session.id}>
              <button
                className="w-full text-left"
                onClick={() => setExpandedSession(isExpanded ? null : session.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{session.workoutName}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(session.completed_at!), "MMM d, yyyy · h:mm a")}
                        </span>
                        {session.exerciseModifications.length > 0 && (
                          <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500">
                            ⚠ {session.exerciseModifications.length} modification{session.exerciseModifications.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        {session.workoutPhase && (
                          <Badge variant="secondary" className="text-[10px]">
                            {session.workoutPhase}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{uniqueExercises} exercises</p>
                        <p className="text-xs font-medium text-foreground">
                          {totalVolume.toLocaleString()} lbs
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>
              </button>

              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="border-t border-border pt-3 space-y-3">
                    {/* Group logs by exercise */}
                    {Array.from(
                      session.exerciseLogs.reduce((map, log) => {
                        const group = map.get(log.exercise_id) || { name: log.exercise_name, sets: [] };
                        group.sets.push(log);
                        map.set(log.exercise_id, group);
                        return map;
                      }, new Map<string, { name: string; sets: ExerciseLogRow[] }>())
                    ).map(([exId, group]) => (
                      <div key={exId} className="space-y-1.5">
                        <h5 className="text-sm font-medium text-foreground">{group.name}</h5>
                        <div className="grid gap-1">
                          {group.sets
                            .sort((a, b) => a.set_number - b.set_number)
                            .map((set, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-4 text-xs px-3 py-1.5 rounded bg-secondary/30"
                              >
                                <span className="text-muted-foreground w-10">Set {set.set_number}</span>
                                <span className="font-medium text-foreground">
                                  {set.weight === 0 ? "BW" : `${set.weight || 0} lbs`}
                                </span>
                                <span className="text-muted-foreground">×</span>
                                <span className="font-medium text-foreground">{set.reps || 0} reps</span>
                                {set.rir != null && (
                                  <span className="text-muted-foreground ml-auto">
                                    RIR {set.rir}
                                  </span>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                    {session.notes && (
                      <p className="text-xs text-muted-foreground italic mt-2">{session.notes}</p>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default WorkoutHistory;
