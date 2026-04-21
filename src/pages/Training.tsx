import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Play, History, Copy, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WorkoutBuilder from "@/components/WorkoutBuilder";
import WorkoutLogger from "@/components/WorkoutLogger";
import WorkoutHistory from "@/components/training/WorkoutHistory";
import ClientProgramView from "@/components/training/ClientProgramView";
import { useDataFetch, invalidateCache } from "@/hooks/useDataFetch";
import { GridSkeleton, RetryBanner } from "@/components/ui/data-skeleton";
import { fetchWorkoutExerciseDetails } from "@/lib/workoutExerciseQueries";

import { useAuth } from "@/hooks/useAuth";

const Training = () => {
  const { role, user, session } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [showLogger, setShowLogger] = useState(false);

  // Treat admin the same as coach for training page
  const isCoachOrAdmin = role === "coach" || role === "admin";

  const cacheKey = `workouts-${user?.id}-${role}`;

  const { data: workouts = [], loading, error, timedOut, refetch } = useDataFetch<any[]>({
    queryKey: cacheKey,
    enabled: !!user && !!session,
    staleTime: 3 * 60 * 1000,
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];
      console.log("[Training] queryFn start, role:", role, "userId:", user.id.slice(0, 8));
      if (isCoachOrAdmin) {
        const { data, error } = await supabase
          .from("workouts")
          .select("id, name, description, phase, is_template, instructions")
          .eq("coach_id", user.id)
          .abortSignal(signal);
        if (error) throw error;
        console.log("[Training] coach workouts:", data?.length ?? 0);
        return data || [];
      }
      // Client: only show workouts from assigned programs (no duplicates)
      const { data: assignments } = await supabase
        .from("client_program_assignments")
        .select("program_id")
        .eq("client_id", user.id)
        .in("status", ["active", "subscribed"])
        .abortSignal(signal);

      console.log("[Training] client assignments:", assignments?.length ?? 0);

      if (assignments && assignments.length > 0) {
        const programIds = assignments.map(a => a.program_id);
        // Get phases AND weeks for these programs
        const [phasesResult, weeksResult] = await Promise.allSettled([
          supabase.from("program_phases").select("id").in("program_id", programIds),
          supabase.from("program_weeks").select("id").in("program_id", programIds),
        ]);
        const phases = phasesResult.status === "fulfilled" ? phasesResult.value.data : [];
        const weeks = weeksResult.status === "fulfilled" ? weeksResult.value.data : [];
        const phaseIds = (phases || []).map(p => p.id);
        const weekIds = (weeks || []).map(w => w.id);

        // Get workout IDs from program_workouts via phase_id OR week_id
        const pwQueries = [];
        if (phaseIds.length > 0) pwQueries.push(supabase.from("program_workouts").select("workout_id").in("phase_id", phaseIds));
        if (weekIds.length > 0) pwQueries.push(supabase.from("program_workouts").select("workout_id").in("week_id", weekIds));
        const pwResults = await Promise.allSettled(pwQueries);
        const workoutIds = [...new Set(pwResults.flatMap(r => r.status === "fulfilled" ? (r.value.data || []).map((pw: any) => pw.workout_id) : []))];

        if (workoutIds.length > 0) {
          const { data, error: wErr } = await supabase
            .from("workouts")
            .select("id, name, description, phase, is_template, instructions")
            .in("id", workoutIds)
            .abortSignal(signal);
          if (wErr) throw wErr;
          console.log("[Training] client program workouts:", data?.length ?? 0);
          if (data && data.length > 0) return data;
        }
      }
      // Fallback: direct client_id workouts (always runs if program path returned nothing)
      console.log("[Training] falling back to direct client_id workouts");
      const { data, error: fErr } = await supabase
        .from("workouts")
        .select("id, name, description, phase, is_template, instructions")
        .eq("client_id", user.id)
        .abortSignal(signal);
      if (fErr) throw fErr;
      console.log("[Training] fallback workouts:", data?.length ?? 0);
      return data || [];
    },
  });

  const reloadWorkouts = () => { invalidateCache(cacheKey); refetch(); };

  // Auto-detect active in-progress session on mount and auto-resume
  const activeSessionCheckedRef = useRef(false);
  useEffect(() => {
    if (!user || !session || showLogger || activeSessionCheckedRef.current) return;
    activeSessionCheckedRef.current = true;

    const state = location.state as { startWorkoutId?: string; resumeSessionId?: string; calendarEventId?: string } | null;

    // If navigated here with explicit state (from banner, calendar, etc.), use that
    if (state?.startWorkoutId) {
      loadWorkoutExercises(state.startWorkoutId, state.resumeSessionId, state.calendarEventId);
      window.history.replaceState({}, document.title);
      return;
    }

    // Otherwise, check for any active in-progress session and auto-resume
    const checkActiveSession = async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: activeSession } = await supabase
        .from("workout_sessions")
        .select("id, workout_id, started_at, status, completed_at")
        .eq("client_id", user.id)
        .eq("status", "in_progress")
        .gte("last_heartbeat", twoHoursAgo)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!activeSession) return;

      // Defensive guard (Fix 2B): if this workout already has a completed
      // calendar_event for today, the previous finish flow succeeded but
      // either status didn't flip or the row is stale. Do NOT re-hydrate
      // the tracker with pre-filled completed data.
      const todayStr = new Date().toLocaleDateString("en-CA");
      const { data: completedToday } = await supabase
        .from("calendar_events")
        .select("id")
        .eq("linked_workout_id", activeSession.workout_id)
        .eq("event_type", "workout")
        .eq("event_date", todayStr)
        .eq("is_completed", true)
        .or(`user_id.eq.${user.id},target_client_id.eq.${user.id}`)
        .limit(1);

      if (completedToday && completedToday.length > 0) {
        console.log("[Training] Skip auto-resume: workout already completed today");
        // Self-heal: mark the lingering in-progress row as completed so it
        // never triggers re-hydration again.
        await supabase
          .from("workout_sessions")
          .update({ status: "completed" } as any)
          .eq("id", activeSession.id);
        return;
      }

      console.log("[Training] Auto-resuming active session:", activeSession.id.slice(0, 8));
      loadWorkoutExercises(activeSession.workout_id, activeSession.id);
    };
    checkActiveSession();
  }, [user, session, showLogger, location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadWorkoutExercises = async (workoutId: string, resumeSessionId?: string, calendarEventId?: string) => {
    try {
      const data = await fetchWorkoutExerciseDetails(workoutId);
      const exerciseLogs = data.map((we) => {
        const equipment = we.exercise?.equipment || null;
        const isBodyweight = !!equipment && ["bodyweight", "none", "body weight"].includes(equipment.toLowerCase());

        return {
          id: we.exercise?.id || we.exercise_id,
          name: we.exercise?.name || "Exercise",
          sets: we.sets,
          reps: we.reps,
          tempo: we.tempo,
          restSeconds: we.rest_seconds ?? 90,
          rir: we.rir,
          notes: we.notes,
          videoUrl: we.video_override || we.exercise?.youtube_url || we.exercise?.video_url || null,
          equipment,
          progression: {
            progressionType: we.progression_type || "double",
            weightIncrement: we.weight_increment || 5,
            incrementType: we.increment_type || "fixed",
            rpeThreshold: we.rpe_threshold || 8,
            progressionMode: we.progression_mode || "moderate",
          },
          logs: Array.from({ length: we.sets }, (_, idx) => ({
            setNumber: idx + 1,
            weight: isBodyweight ? 0 : undefined,
            reps: undefined,
            tempo: undefined,
            rir: undefined,
            notes: undefined,
          })),
        };
      });

      let workout = workouts.find(w => w.id === workoutId);
      if (!workout) {
        const { data: w, error: workoutError } = await supabase
          .from("workouts")
          .select("name, instructions")
          .eq("id", workoutId)
          .maybeSingle();
        if (workoutError) throw workoutError;
        workout = w;
      }

      setSelectedWorkout({
        id: workoutId,
        name: workout?.name || "Workout",
        instructions: workout?.instructions || null,
        exercises: exerciseLogs,
        resumeSessionId: resumeSessionId || null,
        calendarEventId: calendarEventId || null,
      });
      setShowLogger(true);
    } catch (err: any) {
      console.error("[Training] loadWorkoutExercises error:", err);
      toast({
        title: "Couldn't load workout",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (showBuilder && isCoachOrAdmin) {
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
        <div className="fixed inset-0 z-[55] bg-background overflow-y-auto safe-top pb-24 px-4 md:relative md:inset-auto md:z-auto md:pb-0 md:px-0 md:safe-top-0 animate-fade-in">
          <WorkoutLogger workoutId={selectedWorkout.id} workoutName={selectedWorkout.name} workoutInstructions={selectedWorkout.instructions} exercises={selectedWorkout.exercises} resumeSessionId={selectedWorkout.resumeSessionId} calendarEventId={selectedWorkout.calendarEventId} onComplete={() => { setShowLogger(false); setSelectedWorkout(null); reloadWorkouts(); }} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">Training</h1>
          {isCoachOrAdmin && (
            <Button onClick={() => setShowBuilder(true)}><Plus className="h-4 w-4 mr-2" /> Create Workout</Button>
          )}
        </div>

        <Tabs defaultValue={role === "client" ? "program" : "workouts"}>
          <TabsList>
            {role === "client" && <TabsTrigger value="program" className="gap-1.5"><FolderOpen className="h-3.5 w-3.5" /> Program</TabsTrigger>}
            {isCoachOrAdmin && <TabsTrigger value="workouts">Workouts</TabsTrigger>}
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
              <Card><CardContent className="pt-6"><p className="text-center text-muted-foreground">{isCoachOrAdmin ? "Create your first workout template" : "No workouts assigned yet"}</p></CardContent></Card>
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
                      {isCoachOrAdmin && (
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

          
          <TabsContent value="history"><WorkoutHistory /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Training;
