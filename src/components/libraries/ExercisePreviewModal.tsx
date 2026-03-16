import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dumbbell, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Exercise {
  id: string;
  name: string;
  primary_muscle: string | null;
  secondary_muscle: string | null;
  equipment: string | null;
  youtube_url: string | null;
  youtube_thumbnail: string | null;
  video_url: string | null;
  description: string | null;
  category: string;
}

interface Props {
  exercise: Exercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (exercise: Exercise) => void;
  onDeleted?: (exerciseId: string) => void;
}

function getYouTubeEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=1` : null;
}

const ExercisePreviewModal = ({ exercise, open, onOpenChange, onEdit, onDeleted }: Props) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!exercise) return null;

  const embedUrl = getYouTubeEmbedUrl(exercise.youtube_url);
  const hasUploadedVideo = exercise.video_url && !exercise.youtube_url;

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from("exercises").delete().eq("id", exercise.id);
    setDeleting(false);

    if (error) {
      console.error("[ExercisePreviewModal] Delete error:", error);
      toast.error("Failed to delete exercise: " + error.message);
      return;
    }

    toast.success(`"${exercise.name}" deleted`);
    setConfirmOpen(false);
    onOpenChange(false);
    onDeleted?.(exercise.id);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* Left: Video */}
            <div className="md:w-3/5 bg-black flex items-center justify-center min-h-[240px] md:min-h-[360px]">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  className="w-full h-full min-h-[240px] md:min-h-[360px]"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  title={exercise.name}
                />
              ) : hasUploadedVideo ? (
                <video
                  src={exercise.video_url!}
                  className="w-full h-full object-contain"
                  autoPlay
                  muted
                  controls
                  playsInline
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted-foreground gap-2 p-8">
                  <Dumbbell className="h-12 w-12 opacity-30" />
                  <p className="text-sm">No video available</p>
                </div>
              )}
            </div>

            {/* Right: Info */}
            <div className="md:w-2/5 p-5 space-y-4 relative">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-foreground leading-tight">{exercise.name}</h3>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(exercise)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                {exercise.primary_muscle && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Primary Muscle</p>
                    <Badge variant="secondary">{exercise.primary_muscle}</Badge>
                  </div>
                )}
                {exercise.secondary_muscle && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Secondary Muscle</p>
                    <Badge variant="outline">{exercise.secondary_muscle}</Badge>
                  </div>
                )}
                {exercise.equipment && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Equipment</p>
                    <Badge variant="outline">{exercise.equipment}</Badge>
                  </div>
                )}
                {exercise.category && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Exercise Type</p>
                    <p className="text-foreground">{exercise.category}</p>
                  </div>
                )}
              </div>

              {exercise.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Instructions</p>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{exercise.description}</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>"{exercise.name}"</strong> from your exercise library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete Now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ExercisePreviewModal;
