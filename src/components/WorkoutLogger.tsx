import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, Trophy, TrendingUp, ChevronDown, ChevronUp, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import RestTimer from "./RestTimer";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface ProgressionSettings {
  progressionType: string;
  weightIncrement: number;
  incrementType: string;
  rpeThreshold: number;
  progressionMode: string;
}

interface ExerciseLogForm {
  id: string;
  name: string;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  rir?: number;
  notes: string;
  videoUrl?: string | null;
  progression?: ProgressionSettings;
  logs: {
    setNumber: number;
    weight?: number;
    reps?: number;
    tempo?: string;
    rir?: number;
    rpe?: number;
    notes?: string;
    completed?: boolean;
  }[];
}

interface PersonalRecord {
  exercise_id: string;
  weight: number;
  reps: number;
}

interface PRAlert {
  exerciseName: string;
  weight: number;
  reps: number;
}

interface WorkoutLoggerProps {
  workoutId: string;
  workoutName: string;
  workoutInstructions?: string | null;
  exercises: ExerciseLogForm[];
  onComplete?: () => void;
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

const WorkoutLogger = ({ workoutId, workoutName, workoutInstructions, exercises: initialExercises, onComplete }: WorkoutLoggerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [exercises, setExercises] = useState(initialExercises);
  const [activeRestTimer, setActiveRestTimer] = useState<{ exerciseIdx: number; setIdx: number } | null>(null);
  const [restTimerKey, setRestTimerKey] = useState(0);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [prAlerts, setPrAlerts] = useState<PRAlert[]>([]);
  const [startTime] = useState(Date.now());
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [previousPerformance, setPreviousPerformance] = useState<Record<string, any[]>>({});
  const [suggestedWeights, setSuggestedWeights] = useState<Record<string, number>>({});
  const exerciseRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Load existing PRs and previous performance
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const exerciseIds = initialExercises.map(e => e.id);
      const { data } = await supabase
        .from("personal_records")
        .select("exercise_id, weight, reps")
        .eq("client_id", user.id)
        .in("exercise_id", exerciseIds);
      setPersonalRecords((data as PersonalRecord[]) || []);

      const { data: lastSession } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("client_id", user.id)
        .eq("workout_id", workoutId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSession) {
        const { data: logs } = await supabase
          .from("exercise_logs")
          .select("exercise_id, set_number, weight, reps, rir")
          .eq("session_id", lastSession.id)
          .order("set_number");

        if (logs) {
          const grouped: Record<string, any[]> = {};
          logs.forEach(l => {
            if (!grouped[l.exercise_id]) grouped[l.exercise_id] = [];
            grouped[l.exercise_id].push(l);
          });
          setPreviousPerformance(grouped);

          const suggestions: Record<string, number> = {};
          initialExercises.forEach(ex => {
            const prevLogs = grouped[ex.id];
            if (!prevLogs || prevLogs.length === 0) return;
            const avgWeight = prevLogs.reduce((s, l) => s + (l.weight || 0), 0) / prevLogs.length;
            suggestions[ex.id] = Math.round(avgWeight * 2) / 2;
          });
          setSuggestedWeights(suggestions);
        }
      }
    };
    loadData();
  }, [user, initialExercises, workoutId]);

  const totalSets = exercises.reduce((acc, ex) => acc + ex.logs.length, 0);
  const completedSets = exercises.reduce(
    (acc, ex) => acc + ex.logs.filter(l => l.completed).length, 0
  );
  const progressPercent = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  const updateLog = (exIdx: number, setIdx: number, field: string, value: unknown) => {
    const newEx = [...exercises];
    newEx[exIdx].logs[setIdx] = { ...newEx[exIdx].logs[setIdx], [field]: value };
    setExercises(newEx);
  };

  const checkPR = useCallback((exerciseId: string, exerciseName: string, weight: number, reps: number) => {
    const existingPR = personalRecords.find(pr => pr.exercise_id === exerciseId);
    if (!existingPR || weight > existingPR.weight || (weight === existingPR.weight && reps > existingPR.reps)) {
      const existingAlert = prAlerts.find(a => a.exerciseName === exerciseName);
      if (!existingAlert || weight > existingAlert.weight || (weight === existingAlert.weight && reps > existingAlert.reps)) {
        setPrAlerts(prev => [
          ...prev.filter(a => a.exerciseName !== exerciseName),
          { exerciseName, weight, reps },
        ]);
        toast({ title: "🏆 NEW PR!", description: `${exerciseName}: ${weight} lbs × ${reps} reps` });
      }
    }
  }, [personalRecords, prAlerts, toast]);

  const completeSet = (exIdx: number, setIdx: number) => {
    const ex = exercises[exIdx];
    const log = ex.logs[setIdx];
    if (!log.weight || !log.reps) return;

    updateLog(exIdx, setIdx, "completed", true);
    checkPR(ex.id, ex.name, log.weight, log.reps);

    // Auto-start rest timer
    if (ex.restSeconds > 0) {
      setActiveRestTimer({ exerciseIdx: exIdx, setIdx });
      setRestTimerKey(prev => prev + 1);
    }
  };

  const completeWorkout = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: session, error: sessionError } = await supabase
        .from("workout_sessions")
        .insert({ client_id: user.id, workout_id: workoutId, completed_at: new Date().toISOString() })
        .select()
        .single();
      if (sessionError) throw sessionError;

      const logsToInsert = exercises.flatMap((ex) =>
        ex.logs.filter(log => log.completed).map((log) => ({
          session_id: session.id,
          exercise_id: ex.id,
          set_number: log.setNumber,
          weight: log.weight || null,
          reps: log.reps || null,
          tempo: log.tempo || null,
          rir: log.rir ?? (log.rpe ? (10 - (log.rpe || 0)) : null),
          notes: log.notes || null,
        }))
      );

      if (logsToInsert.length > 0) {
        const { error: logsError } = await supabase.from("exercise_logs").insert(logsToInsert);
        if (logsError) throw logsError;
      }

      for (const alert of prAlerts) {
        const ex = exercises.find(e => e.name === alert.exerciseName);
        if (ex) {
          await supabase.rpc("update_personal_record", {
            _client_id: user.id, _exercise_id: ex.id, _weight: alert.weight, _reps: alert.reps,
          });
        }
      }

      const elapsed = Math.round((Date.now() - startTime) / 60000);
      toast({
        title: "Workout Complete! 💪",
        description: `${completedSets} sets in ${elapsed} min${prAlerts.length > 0 ? ` — ${prAlerts.length} new PR(s)!` : ""}`,
      });
      onComplete?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getPRForExercise = (exerciseId: string) => personalRecords.find(pr => pr.exercise_id === exerciseId);

  return (
    <div className="space-y-4 pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-3 border-b border-border -mx-4 px-4 pt-2">
        <h2 className="text-xl font-display font-bold text-foreground">{workoutName}</h2>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={progressPercent} className="flex-1 h-3" />
          <span className="text-sm font-bold text-primary whitespace-nowrap tabular-nums">
            {completedSets}/{totalSets}
          </span>
        </div>
      </div>

      {workoutInstructions && (
        <div className="p-3 rounded-lg bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{workoutInstructions}</p>
        </div>
      )}

      {/* PR Alerts */}
      {prAlerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {prAlerts.map((pr, i) => (
            <Badge key={i} variant="default" className="gap-1">
              <Trophy className="h-3 w-3" /> {pr.exerciseName}: {pr.weight}×{pr.reps}
            </Badge>
          ))}
        </div>
      )}

      {/* ALL EXERCISES — Full scroll view (Strong App style) */}
      {exercises.map((exercise, exIdx) => {
        const allDone = exercise.logs.every(l => l.completed);
        const pr = getPRForExercise(exercise.id);
        const videoId = exercise.videoUrl ? getYouTubeId(exercise.videoUrl) : null;
        const isVideoExpanded = expandedVideo === exercise.id;

        return (
          <Card
            key={exIdx}
            ref={(el) => { exerciseRefs.current[exIdx] = el; }}
            className={`transition-colors ${allDone ? "border-primary/30" : ""}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle
                  className="text-base cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
                  onClick={() => setExpandedVideo(isVideoExpanded ? null : exercise.id)}
                >
                  {exercise.name}
                  {videoId && (
                    <Play className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </CardTitle>
                {allDone && <Check className="h-5 w-5 text-primary" />}
              </div>

              {/* Exercise metadata */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="text-xs bg-secondary px-2 py-0.5 rounded">{exercise.sets} sets · {exercise.reps}</span>
                {exercise.tempo && <span className="text-xs bg-secondary px-2 py-0.5 rounded">Tempo: {exercise.tempo}</span>}
                {exercise.rir != null && <span className="text-xs bg-secondary px-2 py-0.5 rounded">RIR: {exercise.rir}</span>}
                {exercise.restSeconds > 0 && <span className="text-xs bg-secondary px-2 py-0.5 rounded">Rest: {exercise.restSeconds}s</span>}
              </div>

              {pr && (
                <p className="text-xs text-primary mt-1 flex items-center gap-1">
                  <Trophy className="h-3 w-3" /> PR: {pr.weight} lbs × {pr.reps} reps
                </p>
              )}
            </CardHeader>

            {/* YouTube Video Embed */}
            {isVideoExpanded && videoId && (
              <div className="px-4 pb-2">
                <AspectRatio ratio={16 / 9}>
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                    title={exercise.name}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full rounded-lg"
                  />
                </AspectRatio>
              </div>
            )}

            <CardContent className="space-y-2 pt-0">
              {exercise.notes && (
                <div className="p-2 rounded bg-secondary/50 text-xs text-muted-foreground">
                  {exercise.notes}
                </div>
              )}

              {/* Suggested weight */}
              {suggestedWeights[exercise.id] && !allDone && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <TrendingUp className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="text-xs font-medium">Last: {suggestedWeights[exercise.id]} lbs</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] ml-auto"
                    onClick={() => {
                      const newEx = [...exercises];
                      newEx[exIdx].logs.forEach((log, i) => {
                        if (!log.completed && !log.weight) {
                          newEx[exIdx].logs[i].weight = suggestedWeights[exercise.id];
                        }
                      });
                      setExercises(newEx);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              )}

              {/* Set header */}
              <div className="grid grid-cols-4 gap-2 px-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Set</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Weight</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Reps</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase text-right">RPE</span>
              </div>

              {/* Set rows — compact inline */}
              {exercise.logs.map((log, setIdx) => {
                const prevSet = previousPerformance[exercise.id]?.find(p => p.set_number === log.setNumber);
                return (
                  <div key={setIdx}>
                    <div className={`grid grid-cols-4 gap-2 items-center p-2 rounded-lg transition-colors ${
                      log.completed ? "bg-primary/5 border border-primary/20" : "bg-card border border-border"
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium w-5 text-center">{log.setNumber}</span>
                        {log.completed && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <Input
                        type="number"
                        value={log.weight ?? ""}
                        onChange={(e) => updateLog(exIdx, setIdx, "weight", e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder={prevSet ? `${prevSet.weight}` : "lbs"}
                        className="text-sm h-8"
                        disabled={log.completed}
                      />
                      <Input
                        type="number"
                        value={log.reps ?? ""}
                        onChange={(e) => updateLog(exIdx, setIdx, "reps", e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder={prevSet ? `${prevSet.reps}` : "0"}
                        className="text-sm h-8"
                        disabled={log.completed}
                      />
                      <div className="flex gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={log.rpe ?? ""}
                          onChange={(e) => updateLog(exIdx, setIdx, "rpe", e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="RPE"
                          className="text-sm h-8 w-14"
                          disabled={log.completed}
                        />
                        <Button
                          size="sm"
                          className="h-8 px-3"
                          variant={log.completed ? "secondary" : "default"}
                          disabled={log.completed || !log.weight || !log.reps}
                          onClick={() => completeSet(exIdx, setIdx)}
                        >
                          {log.completed ? <Check className="h-3.5 w-3.5" /> : "Log"}
                        </Button>
                      </div>
                    </div>

                    {/* Rest timer — appears inline after logged set */}
                    {activeRestTimer?.exerciseIdx === exIdx && activeRestTimer?.setIdx === setIdx && (
                      <div className="mt-2">
                        <RestTimer
                          key={restTimerKey}
                          initialSeconds={exercise.restSeconds}
                          onComplete={() => setActiveRestTimer(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {/* Complete Workout — sticky bottom */}
      {completedSets > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t border-border z-20">
          <Button
            onClick={completeWorkout}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading && <Loader2 className="animate-spin mr-2" />}
            Complete Workout ({completedSets}/{totalSets} sets)
          </Button>
        </div>
      )}
    </div>
  );
};

export default WorkoutLogger;
