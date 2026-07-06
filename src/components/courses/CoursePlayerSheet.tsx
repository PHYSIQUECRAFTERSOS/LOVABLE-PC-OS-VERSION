import { useEffect } from "react";
import { format } from "date-fns";
import { ExternalLink, Pin } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Course } from "@/hooks/useCourses";
import { ytEmbedUrl, ytWatchUrl, formatDuration } from "@/utils/youtube";

interface Props {
  course: Course;
  moduleName: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onWatched: () => void;
}

const CoursePlayerSheet = ({ course, moduleName, open, onOpenChange, onWatched }: Props) => {
  // Mark watched after 10s
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onWatched(), 10_000);
    return () => clearTimeout(t);
  }, [open, onWatched]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] w-full overflow-y-auto p-0 sm:max-w-3xl sm:mx-auto sm:rounded-t-2xl"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{course.title}</SheetTitle>
        </SheetHeader>

        {/* Player */}
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={ytEmbedUrl(course.youtube_video_id) + "&autoplay=1"}
            title={course.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>

        {/* Body */}
        <div className="space-y-4 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
          <div>
            <h2 className="text-lg font-bold leading-snug">{course.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {moduleName && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                  {moduleName}
                </span>
              )}
              {course.is_pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-primary">
                  <Pin className="h-3 w-3" /> Pinned
                </span>
              )}
              <span>{format(new Date(course.posted_at), "MMM d, yyyy")}</span>
              {course.duration_seconds ? <span>{formatDuration(course.duration_seconds)}</span> : null}
            </div>
            {course.tags?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {course.tags.map((t) => (
                  <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    #{t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {course.description && (
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-card/40 p-3 text-sm leading-relaxed text-foreground/90">
              {course.description}
            </div>
          )}

          <Button variant="outline" className="w-full" asChild>
            <a href={ytWatchUrl(course.youtube_video_id)} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in YouTube
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CoursePlayerSheet;
