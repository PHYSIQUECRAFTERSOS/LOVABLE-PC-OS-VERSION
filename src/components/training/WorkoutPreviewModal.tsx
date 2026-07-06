import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, Dumbbell, MoreVertical, Pencil, Copy, Trash2, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchWorkoutExerciseDetails } from "@/lib/workoutExerciseQueries";

interface ExerciseDetail {
  id: string;
  name: string;
  sets: number;
  reps: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rir: number | null;
  rpe_target: number | null;
  notes: string | null;
  youtube_thumbnail: string | null;
  youtube_url: string | null;
  video_url: string | null;
  equipment: string | null;
  primary_muscle: string | null;
  grouping_type: string | null;
  grouping_id: string | null;
}

interface WorkoutPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workoutId: string | null;
  workoutName: string;
  onStartWorkout: (workoutId: string) => void;
  /** Override the bottom button label (default: "Start Workout") */
  actionLabel?: string;
  /** Override the bottom button icon (default: Play) */
  actionIcon?: React.ReactNode;
  /** Coach mobile 3-dot menu callbacks */
  isCoach?: boolean;
  onEdit?: (workoutId: string) => void;
  onDuplicate?: (workoutId: string) => void;
  onDelete?: (workoutId: string) => void;
  onRename?: (workoutId: string, newName: string) => void;
}

const WorkoutPreviewModal = ({
  open,
  onOpenChange,
  workoutId,
  workoutName,
  onStartWorkout,
  actionLabel = "Start Workout",
  actionIcon,
  isCoach = false,
  onEdit,
  onDuplicate,
  onDelete,
  onRename,
}: WorkoutPreviewModalProps) => {
  const [exercises, setExercises] = useState<ExerciseDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const getYouTubeId = (url: string): string | null => {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  };

  // 3-dot menu state
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const loadWorkout = useCallback(async (signal?: AbortSignal) => {
    if (!workoutId) return;
    setLoading(true);
    setLoadError(null);
    setShowMenu(false);

    try {
      let workoutQuery = supabase
        .from("workouts")
        .select("instructions")
        .eq("id", workoutId);

      if (signal) workoutQuery = workoutQuery.abortSignal(signal);

      const [exSettled, wSettled] = await Promise.allSettled([
        fetchWorkoutExerciseDetails(workoutId, signal),
        workoutQuery.maybeSingle(),
      ]);

      if (exSettled.status === "rejected") throw exSettled.reason;
      const exerciseDetails = exSettled.value;

      const wData = wSettled.status === "fulfilled" ? wSettled.value.data : null;
      setInstructions(wData?.instructions || null);

      const mapped: ExerciseDetail[] = exerciseDetails.map((we) => ({
        id: we.id,
        name: we.exercise?.name || "Exercise",
        sets: we.sets,
        reps: we.reps,
        rest_seconds: we.rest_seconds,
        tempo: we.tempo,
        rir: we.rir,
        rpe_target: we.rpe_target,
        notes: we.notes,
        youtube_thumbnail: we.exercise?.youtube_thumbnail || null,
        youtube_url: we.exercise?.youtube_url || null,
        video_url: we.exercise?.video_url || null,
        equipment: we.exercise?.equipment || null,
        primary_muscle: we.exercise?.primary_muscle || null,
        grouping_type: we.grouping_type,
        grouping_id: we.grouping_id,
      }));

      setExercises(mapped);
      setLoading(false);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("[WorkoutPreviewModal] load error:", err);
      }
      setExercises([]);
      setInstructions(null);
      setLoadError(err?.name === "AbortError" || err?.message?.includes("timeout") || err?.code === "57014" ? "timeout" : "error");
      setLoading(false);
    }
  }, [workoutId]);

  useEffect(() => {
    if (!open || !workoutId) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);

    void loadWorkout(controller.signal).finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, workoutId, retryNonce, loadWorkout]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    setShowDeleteConfirm(true);
  };

  const handleRenameClick = () => {
    setShowMenu(false);
    setRenameValue(workoutName);
    setShowRenameDialog(true);
  };

  const handleRenameConfirm = () => {
    if (workoutId && renameValue.trim() && onRename) {
      onRename(workoutId, renameValue.trim());
    }
    setShowRenameDialog(false);
  };

  const showCoachMenu = isCoach && isMobile;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && (showDeleteConfirm || showRenameDialog)) return;
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg">{workoutName}</DialogTitle>
                {exercises.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              {showCoachMenu && (
                <div className="relative ml-2">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <MoreVertical className="h-5 w-5 text-muted-foreground" />
                  </button>

                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-[hsl(var(--card))] shadow-lg z-20 overflow-hidden">
                        <button
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            setShowMenu(false);
                            if (workoutId && onEdit) { onOpenChange(false); onEdit(workoutId); }
                          }}
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                          Edit Workout
                        </button>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors"
                          onClick={handleRenameClick}
                        >
                          <Type className="h-4 w-4 text-muted-foreground" />
                          Rename
                        </button>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            setShowMenu(false);
                            if (workoutId && onDuplicate) onDuplicate(workoutId);
                          }}
                        >
                          <Copy className="h-4 w-4 text-muted-foreground" />
                          Duplicate
                        </button>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-destructive hover:bg-muted/50 transition-colors"
                          onClick={handleDeleteClick}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[60vh]">
            <div className="p-4 space-y-3">
              {instructions && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-4">
                  <p className="text-xs font-medium text-primary mb-1">Workout Instructions</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-line">{instructions}</p>
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : loadError ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-destructive font-medium">
                    {loadError === "timeout" ? "Workout took too long to load" : "Failed to load workout"}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setRetryNonce((n) => n + 1)}>
                    Retry
                  </Button>
                </div>
              ) : exercises.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No exercises in this workout yet.
                </p>
              ) : (
                exercises.map((ex, idx) => {
                  const isGrouped = ex.grouping_type && ex.grouping_id;
                  const isFirstInGroup =
                    isGrouped &&
                    (idx === 0 || exercises[idx - 1]?.grouping_id !== ex.grouping_id);

                  return (
                    <div key={ex.id}>
                      {isFirstInGroup && (
                        <Badge
                          variant="outline"
                          className="text-[9px] mb-1.5 border-primary/30 text-primary"
                        >
                          {ex.grouping_type === "superset"
                            ? "Superset"
                            : ex.grouping_type === "circuit"
                            ? "Circuit"
                            : ex.grouping_type}
                        </Badge>
                      )}
                      <div
                        className={`flex gap-3 rounded-lg border border-border bg-card/50 p-3 ${
                          isGrouped ? "ml-2 border-l-2 border-l-primary/30" : ""
                        }`}
                      >
                        {(() => {
                          const playUrl = ex.youtube_url || ex.video_url;
                          const ThumbInner = ex.youtube_thumbnail ? (
                            <img
                              src={ex.youtube_thumbnail}
                              alt={ex.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <Dumbbell className="h-6 w-6 text-muted-foreground/50" />
                          );
                          return playUrl ? (
                            <button
                              type="button"
                              aria-label="Watch exercise video"
                              onClick={() => setVideoUrl(playUrl)}
                              className="relative h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center group"
                            >
                              {ThumbInner}
                              <span className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                                <span className="inline-flex items-center justify-center h-7 w-9 rounded-md bg-red-600 shadow">
                                  <Play className="h-3.5 w-3.5 text-white fill-white" />
                                </span>
                              </span>
                            </button>
                          ) : (
                            <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                              {ThumbInner}
                            </div>
                          );
                        })()}

                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {ex.name}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[11px] text-muted-foreground">
                              {ex.sets} sets
                              {ex.reps ? ` × ${ex.reps}` : ""}
                            </span>
                            {ex.tempo && (
                              <span className="text-[11px] text-muted-foreground">
                                • {ex.tempo}
                              </span>
                            )}
                            {ex.rest_seconds != null && ex.rest_seconds > 0 && (
                              <span className="text-[11px] text-muted-foreground">
                                • {ex.rest_seconds}s rest
                              </span>
                            )}
                            {ex.rpe_target != null && (
                              <span className="text-[11px] text-muted-foreground">
                                • RPE {ex.rpe_target}
                              </span>
                            )}
                            {ex.rir != null && (
                              <span className="text-[11px] text-muted-foreground">
                                • {ex.rir} RIR
                              </span>
                            )}
                          </div>
                          {ex.primary_muscle && (
                            <Badge variant="secondary" className="text-[9px] h-4">
                              {ex.primary_muscle}
                            </Badge>
                          )}
                          {ex.notes && (
                            <p className="text-[11px] text-muted-foreground/80 italic line-clamp-2 mt-0.5">
                              {ex.notes}
                            </p>
                          )}
                        </div>

                        {(ex.youtube_url || ex.video_url) && (
                          <button
                            type="button"
                            aria-label="Watch exercise video"
                            onClick={() => setVideoUrl(ex.youtube_url || ex.video_url)}
                            className="shrink-0 self-center inline-flex items-center justify-center h-8 w-11 rounded-md bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
                          >
                            <Play className="h-4 w-4 text-white fill-white" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Action button */}
          <div className="p-4 pt-2 border-t border-border">
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                if (workoutId) {
                  onOpenChange(false);
                  onStartWorkout(workoutId);
                }
              }}
            >
              {actionIcon || <Play className="h-4 w-4 mr-2" />} {actionLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workout?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium">{workoutName}</span>
              <span className="block mt-2">This cannot be undone. The workout and all its exercises will be permanently removed.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (workoutId && onDelete) {
                  onDelete(workoutId);
                  onOpenChange(false);
                }
                setShowDeleteConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Workout</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Workout name"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm()}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowRenameDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={handleRenameConfirm} disabled={!renameValue.trim()}>Rename</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Exercise video player */}
      <Dialog open={!!videoUrl} onOpenChange={() => setVideoUrl(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          {videoUrl && getYouTubeId(videoUrl) ? (
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
          ) : videoUrl ? (
            <video src={videoUrl} controls autoPlay playsInline className="w-full h-[300px] bg-black" />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkoutPreviewModal;
