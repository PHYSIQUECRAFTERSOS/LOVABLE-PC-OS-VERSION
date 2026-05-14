import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addDays, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, X, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { usePhaseBoundaries } from "@/hooks/usePhaseBoundaries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  event_type: string;
  event_date: string;
  event_time?: string | null;
  end_time?: string | null;
  color?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  notes?: string | null;
  target_client_id?: string | null;
  linked_workout_id?: string | null;
  linked_cardio_id?: string | null;
  linked_checkin_id?: string | null;
  is_recurring: boolean;
  recurrence_pattern?: string | null;
  user_id: string;
};

const EVENT_COLORS: Record<string, string> = {
  workout: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  cardio: "bg-green-500/20 text-green-400 border-green-500/30",
  checkin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  rest: "bg-muted text-muted-foreground border-border",
  reminder: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  custom: "bg-primary/20 text-primary border-primary/30",
  auto_message: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  photos: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  body_stats: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  steps: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  nutrition: "bg-red-500/20 text-red-400 border-red-500/30",
};

const EVENT_DOT_COLORS: Record<string, string> = {
  workout: "bg-amber-500",
  cardio: "bg-green-500",
  checkin: "bg-purple-500",
  rest: "bg-muted-foreground",
  reminder: "bg-yellow-500",
  custom: "bg-primary",
  auto_message: "bg-orange-500",
  photos: "bg-orange-500",
  body_stats: "bg-purple-500",
  steps: "bg-blue-500",
  nutrition: "bg-red-500",
};

interface CalendarGridProps {
  events: CalendarEvent[];
  view: "week" | "month";
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: Date) => void;
  onPrev: () => void;
  onNext: () => void;
}

const CalendarGrid = ({
  events,
  view,
  currentDate,
  onDateChange,
  onEventClick,
  onDayClick,
  onPrev,
  onNext,
}: CalendarGridProps) => {
  const [expandedDay, setExpandedDay] = useState<Date | null>(null);
  const { user } = useAuth();
  const { boundariesByDate } = usePhaseBoundaries(user?.id);

  const days = view === "week"
    ? eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) })
    : (() => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
        return eachDayOfInterval({ start: calStart, end: calEnd });
      })();

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.event_date), day));

  const weekDayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const maxVisible = view === "week" ? 5 : 3;

  const expandedDayEvents = expandedDay ? getEventsForDay(expandedDay) : [];

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-bold text-foreground">
          {view === "week"
            ? `${format(days[0], "MMM d")} — ${format(days[6], "MMM d, yyyy")}`
            : format(currentDate, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDateChange(new Date())}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {weekDayHeaders.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const overflowCount = dayEvents.length - maxVisible;

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={cn(
                "min-h-[80px] md:min-h-[110px] p-1.5 bg-card cursor-pointer transition-colors hover:bg-secondary/50",
                !inMonth && view === "month" && "opacity-40",
                today && "ring-1 ring-inset ring-primary/50"
              )}
            >
              <div className={cn(
                "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                today && "bg-primary text-primary-foreground"
              )}>
                {format(day, "d")}
              </div>

              <div className="space-y-0.5">
                {dayEvents.slice(0, maxVisible).map((event) => (
                  <button
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    className={cn(
                      "w-full text-left text-[10px] md:text-xs px-1.5 py-0.5 rounded border truncate flex items-center gap-1",
                      EVENT_COLORS[event.event_type] || EVENT_COLORS.custom,
                      event.is_completed && "line-through opacity-60"
                    )}
                  >
                    {event.is_completed && <Check className="h-2.5 w-2.5 shrink-0" />}
                    <span className="truncate">{event.title}</span>
                  </button>
                ))}
                {overflowCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedDay(day);
                    }}
                    className="w-full text-left text-[10px] text-primary font-medium px-1 hover:underline"
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {Object.entries(EVENT_DOT_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={cn("h-2 w-2 rounded-full", color)} />
            <span className="text-[10px] text-muted-foreground capitalize">{type.replace("_", " ")}</span>
          </div>
        ))}
      </div>

      {/* Expanded Day Modal */}
      <Dialog open={!!expandedDay} onOpenChange={(open) => !open && setExpandedDay(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {expandedDay ? format(expandedDay, "EEEE, MMMM d") : "Events"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 pt-1">
            {expandedDayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No events</p>
            ) : (
              expandedDayEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => {
                    setExpandedDay(null);
                    onEventClick(event);
                  }}
                  className={cn(
                    "w-full text-left text-sm px-3 py-2.5 rounded-lg border flex items-center gap-2 transition-colors hover:bg-secondary/50",
                    EVENT_COLORS[event.event_type] || EVENT_COLORS.custom,
                    event.is_completed && "line-through opacity-60"
                  )}
                >
                  {event.is_completed && <Check className="h-3.5 w-3.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{event.title}</span>
                    {event.event_time && (
                      <span className="text-xs opacity-80">
                        {event.event_time.slice(0, 5)}
                        {event.end_time && ` — ${event.end_time.slice(0, 5)}`}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarGrid;
