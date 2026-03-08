import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Play, History, Copy, HeartPulse, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WorkoutBuilder from "@/components/WorkoutBuilder";
import WorkoutLogger from "@/components/WorkoutLogger";
import WorkoutHistory from "@/components/training/WorkoutHistory";
import CardioManager from "@/components/training/CardioManager";
import ClientProgramView from "@/components/training/ClientProgramView";
import { useDataFetch, invalidateCache } from "@/hooks/useDataFetch";
import { GridSkeleton, RetryBanner } from "@/components/ui/data-skeleton";

import { useAuth } from "@/hooks/useAuth";

const Training = () => {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [showLogger, setShowLogger] = useState(false);

  const cacheKey = `workouts-${user?.id}-${role}`;

  const { data: workouts = [], loading, error, timedOut, refetch } = useDataFetch<any[]>({
    queryKey: cacheKey,
    enabled: !!user,
    staleTime: 3 * 60 * 1000,
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];
      if (role === "coach") {
        const { data, error } = await supabase
          .from("workouts")
          .select("id, name, description, phase, is_template, instructions")
          .eq("coach_id", user.id)
          .abortSignal(signal);
        if (error) throw error;
        return data || [];
      }
      // Client: only show workouts from assigned programs (no duplicates)
      const { data: assignments } = await supabase
        .from("client_program_assignments")
        .select("program_id")
        .eq("client_id", user.id)
        .in("status", ["active", "subscribed"])
        .abortSignal(signal);

      if (assignments && assignments.length > 0) {
        const programIds = assignments.map(a => a.program_id);
        // Get phases for these programs
        const { data: phases } = await supabase
          .from("program_phases")
          .select("id")
          .in("program_id", programIds);
        const phaseIds = (phases || []).map(p => p.id);

        // Get workout IDs from program_workouts
        const { data: pws } = await supabase
          .from("program_workouts")
          .select("workout_id")
          .in("phase_id", phaseIds);
        const workoutIds = [...new Set((pws || []).map(pw => pw.workout_id))];

        if (workoutIds.length > 0) {
          const { data, error: wErr } = await supabase
            .from("workouts")
            .select("id, name, description, phase, is_template, instructions")
            .in("id", workoutIds)
            .abortSignal(signal);
          if (wErr) throw wErr;
          return data || [];
        }
      }
      // Fallback: direct client_id workouts
      const { data, error: fErr } = await supabase
        .from("workouts")
        .select("id, name, description, phase, is_template, instructions")
        .eq("client_id", user.id)
        .abortSignal(signal);
      if (fErr) throw fErr;
      return data || [];
    },
  });

  const reloadWorkouts = () => { invalidateCache(cacheKey); refetch(); };

  // Auto-start workout from navigation state (e.g., from calendar or resume banner)
  useEffect(() => {
    const state = location.state as { startWorkoutId?: string; resumeSessionId?: string; calendarEventId?: string } | null;
    if (state?.startWorkoutId && !showLogger) {
      loadWorkoutExercises(state.startWorkoutId, state.resumeSessionId, state.calendarEventId);
      // Clear state to prevent re-triggering
      window.history.replaceState({}, document.title);
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadWorkoutExercises = async (workoutId: string, resumeSessionId?: string) => {
    const { data } = await supabase
      .from("workout_exercises")
      .select(`id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, video_override, progression_type, weight_increment, increment_type, rpe_threshold, progression_mode, exercises (id, name, youtube_url, video_url, equipment)`)
      .eq("workout_id", workoutId)
      .order("exercise_order");

    if (data) {
      const exerciseLogs = data.map((we: any) => ({
        id: we.exercises.id, name: we.exercises.name, sets: we.sets, reps: we.reps,
        tempo: we.tempo, restSeconds: we.rest_seconds, rir: we.rir, notes: we.notes,
        videoUrl: we.video_override || we.exercises.youtube_url || we.exercises.video_url || null,
        equipment: we.exercises.equipment || null,
        progression: {
          progressionType: we.progression_type || "double", weightIncrement: we.weight_increment || 5,
          incrementType: we.increment_type || "fixed", rpeThreshold: we.rpe_threshold || 8,
          progressionMode: we.progression_mode || "moderate",
        },
        logs: Array.from({ length: we.sets }, (_, idx) => {
          const isBW = we.exercises.equipment && ["bodyweight", "none", "body weight"].includes(we.exercises.equipment.toLowerCase());
          return {
            setNumber: idx + 1, weight: isBW ? 0 : undefined, reps: undefined, tempo: undefined, rir: undefined, notes: undefined,
          };
        }),
      }));
      let workout = workouts.find(w => w.id === workoutId);
      if (!workout) {
        const { data: w } = await supabase.from("workouts").select("name, instructions").eq("id", workoutId).maybeSingle();
        workout = w;
      }
      setSelectedWorkout({ id: workoutId, name: workout?.name || "Workout", instructions: workout?.instructions || null, exercises: exerciseLogs, resumeSessionId: resumeSessionId || null });
      setShowLogger(true);
    }
  };

  if (showBuilder && role === "coach") {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold text-foreground">Create Workout</h1>
            <Button variant="outline" onClick={() => setShowBuilder(false)}>Back</Button>
          </div>
          <WorkoutBuilder onSave={() => { setShowBuilder(false); reloadWorkouts(); }} />
        </div>
      </AppLayout>
    );
  }

  if (showLogger && selectedWorkout) {
    return (
      <AppLayout>
        <div className="animate-fade-in">
          <WorkoutLogger workoutId={selectedWorkout.id} workoutName={selectedWorkout.name} workoutInstructions={selectedWorkout.instructions} exercises={selectedWorkout.exercises} resumeSessionId={selectedWorkout.resumeSessionId} onComplete={() => { setShowLogger(false); setSelectedWorkout(null); reloadWorkouts(); }} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">Training</h1>
          {role === "coach" && (
            <Button onClick={() => setShowBuilder(true)}><Plus className="h-4 w-4 mr-2" /> Create Workout</Button>
          )}
        </div>

        <Tabs defaultValue={role === "client" ? "program" : "workouts"}>
          <TabsList>
            {role === "client" && <TabsTrigger value="program" className="gap-1.5"><FolderOpen className="h-3.5 w-3.5" /> Program</TabsTrigger>}
            <TabsTrigger value="workouts">Workouts</TabsTrigger>
            <TabsTrigger value="cardio" className="gap-1.5"><HeartPulse className="h-3.5 w-3.5" /> Cardio</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5"><History className="h-3.5 w-3.5" /> History</TabsTrigger>
          </TabsList>

          {role === "client" && (
            <TabsContent value="program"><ClientProgramView onStartWorkout={loadWorkoutExercises} /></TabsContent>
          )}

          <TabsContent value="workouts">
            {(error || timedOut) && !workouts.length ? (
              <RetryBanner onRetry={reloadWorkouts} />
            ) : loading && !workouts.length ? (
              <GridSkeleton cards={4} />
            ) : workouts.length === 0 ? (
              <Card><CardContent className="pt-6"><p className="text-center text-muted-foreground">{role === "coach" ? "Create your first workout template" : "No workouts assigned yet"}</p></CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {workouts.map((workout) => (
                  <Card key={workout.id} className="flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{workout.name}</CardTitle>
                          {workout.phase && <p className="text-xs text-muted-foreground mt-1">{workout.phase}</p>}
                        </div>
                        {workout.is_template && <span className="text-xs bg-secondary px-2 py-1 rounded">Template</span>}
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      {workout.description && <p className="text-sm text-muted-foreground">{workout.description}</p>}
                      {role === "client" && (
                        <Button className="w-full" onClick={() => loadWorkoutExercises(workout.id)}><Play className="h-4 w-4 mr-2" /> Start Workout</Button>
                      )}
                      {role === "coach" && (
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1">Edit</Button>
                          <Button variant="ghost" size="icon" onClick={async () => {
                            try {
                              const { data: newWorkout, error: wErr } = await supabase.from("workouts").insert({ coach_id: user!.id, name: `${workout.name} (Copy)`, description: workout.description, phase: workout.phase, is_template: true }).select().single();
                              if (wErr) throw wErr;
                              const { data: exercises } = await supabase.from("workout_exercises").select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes").eq("workout_id", workout.id);
                              if (exercises?.length) await supabase.from("workout_exercises").insert(exercises.map((ex: any) => ({ ...ex, workout_id: newWorkout.id })));
                              toast({ title: "Workout duplicated" });
                              reloadWorkouts();
                            } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
                          }} title="Duplicate"><Copy className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cardio"><CardioManager /></TabsContent>
          <TabsContent value="history"><WorkoutHistory /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Training;
