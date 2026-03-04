import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { CalendarEvent } from "./CalendarGrid";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, Repeat, Trash2, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  workout: "Workout",
  cardio: "Cardio",
  checkin: "Check-in",
  rest: "Rest Day",
  reminder: "Reminder",
  custom: "Event",
  auto_message: "Auto Message",
  photos: "Photos",
  body_stats: "Body Stats",
  steps: "Steps",
};

const TYPE_BADGE_COLORS: Record<string, string> = {
  workout: "bg-blue-500/20 text-blue-400",
  cardio: "bg-green-500/20 text-green-400",
  checkin: "bg-purple-500/20 text-purple-400",
  rest: "bg-muted text-muted-foreground",
  reminder: "bg-yellow-500/20 text-yellow-400",
  custom: "bg-primary/20 text-primary",
  auto_message: "bg-orange-500/20 text-orange-400",
  photos: "bg-purple-500/20 text-purple-400",
  body_stats: "bg-orange-500/20 text-orange-400",
};

const EVENT_ROUTES: Record<string, string> = {
  cardio: "/training",
  checkin: "/progress",
  photos: "/progress",
  body_stats: "/progress",
  steps: "/progress",
  nutrition: "/nutrition",
};

interface EventDetailModalProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onComplete: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  isCoach: boolean;
  onStartWorkout?: (workoutId: string) => void;
}

const EventDetailModal = ({
  event,
  open,
  onClose,
  onComplete,
  onDelete,
  isCoach,
  onStartWorkout,
}: EventDetailModalProps) => {
  const navigate = useNavigate();

  if (!event) return null;

  const handleOpenAction = () => {
    onClose();
    if (event.event_type === "workout") {
      if (event.linked_workout_id && onStartWorkout) {
        onStartWorkout(event.linked_workout_id);
      } else {
        navigate("/training");
      }
    } else {
      const route = EVENT_ROUTES[event.event_type];
      if (route) navigate(route);
    }
  };

  const hasActionRoute = event.event_type === "workout" || !!EVENT_ROUTES[event.event_type];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs", TYPE_BADGE_COLORS[event.event_type] || TYPE_BADGE_COLORS.custom)}>
              {TYPE_LABELS[event.event_type] || event.event_type}
            </Badge>
            {event.is_recurring && (
              <Badge variant="outline" className="text-xs gap-1">
                <Repeat className="h-3 w-3" />
                {event.recurrence_pattern}
              </Badge>
            )}
            {event.is_completed && (
              <Badge className="bg-green-500/20 text-green-400 text-xs gap-1">
                <Check className="h-3 w-3" /> Done
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl">{event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{format(new Date(event.event_date), "EEEE, MMMM d, yyyy")}</span>
            {event.event_time && (
              <span className="text-foreground font-medium">
                {event.event_time.slice(0, 5)}
                {event.end_time && ` — ${event.end_time.slice(0, 5)}`}
              </span>
            )}
          </div>

          {event.description && (
            <p className="text-sm text-foreground/80">{event.description}</p>
          )}

          {event.notes && (
            <div className="bg-secondary/50 rounded-md p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{event.notes}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {/* Primary action: Open the full screen for this event type */}
            {!event.is_completed && hasActionRoute && (
              <Button onClick={handleOpenAction} className="flex-1 gap-2">
                <Play className="h-4 w-4" />
                {event.event_type === "workout" ? "Start Workout" : `Open ${TYPE_LABELS[event.event_type] || "Event"}`}
              </Button>
            )}
            {!event.is_completed && event.event_type !== "rest" && (
              <Button variant="outline" onClick={() => onComplete(event)} className={cn(!hasActionRoute && "flex-1", "gap-2")}>
                <Check className="h-4 w-4" />
                {hasActionRoute ? "Done" : "Mark Complete"}
              </Button>
            )}
            {isCoach && (
              <Button variant="destructive" size="icon" onClick={() => onDelete(event)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EventDetailModal;
