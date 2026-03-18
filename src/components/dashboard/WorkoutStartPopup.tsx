import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, HelpCircle, Play } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";

const MUSCLE_INITIALS: Record<string, string> = {
  chest: "C", shoulders: "S", back: "B", legs: "L", arms: "A", core: "Co",
  biceps: "A", triceps: "A", quads: "L", hamstrings: "L", glutes: "L", calves: "L",
  traps: "B", lats: "B", delts: "S", abs: "Co", forearms: "A",
  push: "P", pull: "Pu", upper: "U", lower: "Lo", full: "F",
};

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

interface WorkoutStartPopupProps {
  open: boolean;
  onClose: () => void;
  workoutId: string;
  workoutName: string;
  calendarEventId?: string;
  onStartWorkout: (workoutId: string, calendarEventId?: string) => void;
}

interface ExercisePreview {
  id: string;
  name: string;
  muscle_group: string | null;
  sets: number;
  reps: string | null;
  rest_seconds: number | null;
  rir: number | null;
  video_url: string | null;
  thumbnail_url: string | null;
}

const WorkoutStartPopup = ({ open, onClose, workoutId, workoutName, calendarEventId, onStartWorkout }: WorkoutStartPopupProps) => {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<ExercisePreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastPerformed, setLastPerformed] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !workoutId || !user) return;
    setLoading(true);

    const load = async () => {
      const [exRes, sessionRes] = await Promise.all([
        supabase
          .from("workout_exercises")
          .select("sets, reps, rest_seconds, rir, exercises:exercise_id(id, name, primary_muscle, youtube_url, video_url, youtube_thumbnail)")
          .eq("workout_id", workoutId)
          .order("exercise_order", { ascending: true }),
        supabase
          .from("workout_sessions")
          .select("completed_at")
          .eq("client_id", user.id)
          .eq("workout_id", workoutId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const mapped: ExercisePreview[] = (exRes.data || []).map((we: any) => ({
        id: we.exercises?.id || "",
        name: we.exercises?.name || "Unknown",
        muscle_group: we.exercises?.primary_muscle || null,
        sets: we.sets,
        reps: we.reps,
        rest_seconds: we.rest_seconds,
        rir: we.rir,
        video_url: we.exercises?.youtube_url || we.exercises?.video_url || null,
        thumbnail_url: we.exercises?.youtube_thumbnail || null,
      }));
      setExercises(mapped);

      if (sessionRes.data?.completed_at) {
        setLastPerformed(formatDistanceToNow(new Date(sessionRes.data.completed_at), { addSuffix: true }));
      } else {
        setLastPerformed(null);
      }
      setLoading(false);
    };
    load();
  }, [open, workoutId, user]);

  const getMuscleInitial = (mg: string | null) => {
    if (!mg) return "?";
    const lower = mg.toLowerCase();
    return MUSCLE_INITIALS[lower] || mg.charAt(0).toUpperCase();
  };

  return (
    <>
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle className="text-lg">{workoutName}</DrawerTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {lastPerformed ? `Last performed: ${lastPerformed}` : "Never performed"}
                </p>
                {!loading && exercises.length > 0 && (
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>🏋️ {exercises.length} Exercises</span>
                    <span>⏱ est. {Math.round(exercises.reduce((sum, e) => sum + (e.sets * 1.5) + ((e.rest_seconds || 60) * e.sets / 60), 0))} min</span>
                  </div>
                )}
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : exercises.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No exercises found</p>
            ) : (
              exercises.map((ex, idx) => (
                <div key={`${ex.id}-${idx}`} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                  {ex.thumbnail_url ? (
                    <img
                      src={ex.thumbnail_url}
                      alt={ex.name}
                      className="h-10 w-10 rounded-lg object-cover shrink-0 bg-muted"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-muted-foreground">{getMuscleInitial(ex.muscle_group)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ex.sets} sets × {ex.reps || "?"}
                      {ex.rest_seconds ? `, ${Math.floor(ex.rest_seconds / 60)}m rest between sets` : ""}
                    </p>
                  </div>
                  {ex.video_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setVideoUrl(ex.video_url)}
                    >
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <DrawerFooter className="flex-row gap-3 pt-2">
            <DrawerClose asChild>
              <Button variant="outline" className="flex-1">Cancel</Button>
            </DrawerClose>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              onClick={() => { onStartWorkout(workoutId, calendarEventId); onClose(); }}
              disabled={loading}
            >
              <Play className="h-4 w-4 mr-1" /> Start Workout
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Video Modal */}
      <Dialog open={!!videoUrl} onOpenChange={() => setVideoUrl(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          {videoUrl && getYouTubeId(videoUrl) && (
            <iframe
              src={`https://www.youtube.com/embed/${getYouTubeId(videoUrl)}?playsinline=1&rel=0&modestbranding=1&autoplay=1`}
              title="Exercise Video"
              width="100%"
              height="300"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkoutStartPopup;
