import { useState } from "react";
import { format } from "date-fns";
import { MoreVertical, Pin, Check, Sparkles, Play, Loader2 } from "lucide-react";
import { Course } from "@/hooks/useCourses";
import { ytThumbnail, formatDuration } from "@/utils/youtube";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  course: Course;
  moduleName: string | null;
  watched: boolean;
  canManage: boolean;
  isOwner: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

const CourseCard = ({ course, moduleName, watched, canManage, onOpen, onEdit, onDeleted }: Props) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const thumb = course.thumbnail_url || ytThumbnail(course.youtube_video_id);
  const isNew =
    Date.now() - new Date(course.posted_at).getTime() < 7 * 24 * 60 * 60 * 1000;

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    setDeleting(false);
    if (error) {
      toast.error("Could not delete", { description: error.message });
      return;
    }
    toast.success("Video removed");
    setConfirmDelete(false);
    onDeleted();
  };

  return (
    <>
      <div className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
        <button onClick={onOpen} className="relative block aspect-video w-full overflow-hidden bg-black">
          <img
            src={thumb}
            alt={course.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <div className="rounded-full bg-primary/90 p-3 text-primary-foreground shadow-lg">
              <Play className="h-5 w-5 fill-current" />
            </div>
          </div>
          {course.duration_seconds ? (
            <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {formatDuration(course.duration_seconds)}
            </div>
          ) : null}
          {course.is_pinned && (
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              <Pin className="h-3 w-3" /> Pinned
            </div>
          )}
          {watched && (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
              <Check className="h-3 w-3" /> Watched
            </div>
          )}
        </button>

        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <button onClick={onOpen} className="min-w-0 flex-1 text-left">
              <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
                {course.title}
              </h3>
            </button>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {moduleName && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                {moduleName}
              </span>
            )}
            <span>{format(new Date(course.posted_at), "MMM d, yyyy")}</span>
            {isNew && (
              <span className={cn("inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500")}>
                <Sparkles className="h-2.5 w-2.5" /> New
              </span>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this video?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it for all clients. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CourseCard;
