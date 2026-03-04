import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dumbbell, Pencil, X } from "lucide-react";

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
}

function getYouTubeEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=1` : null;
}

const ExercisePreviewModal = ({ exercise, open, onOpenChange, onEdit }: Props) => {
  if (!exercise) return null;

  const embedUrl = getYouTubeEmbedUrl(exercise.youtube_url);
  const hasUploadedVideo = exercise.video_url && !exercise.youtube_url;

  return (
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
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => onEdit(exercise)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
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
  );
};

export default ExercisePreviewModal;
