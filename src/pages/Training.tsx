import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Play, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WorkoutBuilder from "@/components/WorkoutBuilder";
import WorkoutLogger from "@/components/WorkoutLogger";
import WorkoutHistory from "@/components/training/WorkoutHistory";

const Training = () => {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [showLogger, setShowLogger] = useState(false);

  const loadWorkouts = async () => {
    if (!user) return;
    setLoading(true);

    try {
      if (role === "coach") {
        const { data } = await supabase
          .from("workouts")
          .select("id, name, description, phase, is_template")
          .eq("coach_id", user.id);
        setWorkouts(data || []);
      } else if (role === "client") {
        const { data } = await supabase
          .from("workouts")
          .select("id, name, description, phase, is_template")
          .eq("client_id", user.id);
        setWorkouts(data || []);
      }
    } catch (error: any) {
      toast({ title: "Error loading workouts", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkouts();
  }, [user, role]);

  const loadWorkoutExercises = async (workoutId: string) => {
    const { data } = await supabase
      .from("workout_exercises")
      .select(
        `
        id,
        exercise_order,
        sets,
        reps,
        tempo,
        rest_seconds,
        rir,
        notes,
        exercises (id, name)
      `
      )
      .eq("workout_id", workoutId)
      .order("exercise_order");

    if (data) {
      const exerciseLogs = data.map((we: any) => ({
        id: we.exercises.id,
        name: we.exercises.name,
        sets: we.sets,
        reps: we.reps,
        tempo: we.tempo,
        restSeconds: we.rest_seconds,
        rir: we.rir,
        notes: we.notes,
        logs: Array.from({ length: we.sets }, (_, idx) => ({
          setNumber: idx + 1,
          weight: undefined,
          reps: undefined,
          tempo: undefined,
          rir: undefined,
          notes: undefined,
        })),
      }));

      setSelectedWorkout({
        id: workoutId,
        exercises: exerciseLogs,
      });
      setShowLogger(true);
    }
  };

  if (showBuilder && role === "coach") {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold text-foreground">Create Workout</h1>
            <Button variant="outline" onClick={() => setShowBuilder(false)}>
              Back
            </Button>
          </div>
          <WorkoutBuilder onSave={() => {
            setShowBuilder(false);
            loadWorkouts();
          }} />
        </div>
      </AppLayout>
    );
  }

  if (showLogger && selectedWorkout) {
    return (
      <AppLayout>
        <div className="animate-fade-in">
          <Button variant="outline" onClick={() => setShowLogger(false)} className="mb-4">
            Back
          </Button>
          <WorkoutLogger
            workoutId={selectedWorkout.id}
            workoutName={workouts.find((w) => w.id === selectedWorkout.id)?.name || "Workout"}
            exercises={selectedWorkout.exercises}
            onComplete={() => {
              setShowLogger(false);
              setSelectedWorkout(null);
              loadWorkouts();
            }}
          />
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
            <Button onClick={() => setShowBuilder(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Workout
            </Button>
          )}
        </div>

        <Tabs defaultValue="workouts">
          <TabsList>
            <TabsTrigger value="workouts">Workouts</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-3.5 w-3.5" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workouts">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : workouts.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    {role === "coach" ? "Create your first workout template" : "No workouts assigned yet"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {workouts.map((workout) => (
                  <Card key={workout.id} className="flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{workout.name}</CardTitle>
                          {workout.phase && (
                            <p className="text-xs text-muted-foreground mt-1">{workout.phase}</p>
                          )}
                        </div>
                        {workout.is_template && (
                          <span className="text-xs bg-secondary px-2 py-1 rounded">Template</span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      {workout.description && (
                        <p className="text-sm text-muted-foreground">{workout.description}</p>
                      )}
                      {role === "client" && (
                        <Button
                          className="w-full"
                          onClick={() => loadWorkoutExercises(workout.id)}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Start Workout
                        </Button>
                      )}
                      {role === "coach" && (
                        <Button variant="outline" className="w-full">
                          Edit
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <WorkoutHistory />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Training;
