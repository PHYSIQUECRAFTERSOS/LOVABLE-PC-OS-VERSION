import { useEffect, useRef, useMemo } from "react";
import { format, isToday, isTomorrow, isYesterday, parseISO, eachDayOfInterval, subDays, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarEvent } from "./CalendarGrid";
import { CheckCircle2, Circle, Dumbbell, Heart, Camera, Activity, Footprints, ClipboardCheck, Moon, Bell } from "lucide-react";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  workout: <Dumbbell className="h-5 w-5" />,
  cardio: <Heart className="h-5 w-5" />,
  photos: <Camera className="h-5 w-5" />,
  body_stats: <Activity className="h-5 w-5" />,
  steps: <Footprints className="h-5 w-5" />,
  checkin: <ClipboardCheck className="h-5 w-5" />,
  rest: <Moon className="h-5 w-5" />,
  reminder: <Bell className="h-5 w-5" />,
  nutrition: <Dumbbell className="h-5 w-5" />,
};

const TYPE_ACCENT: Record<string, string> = {
  workout: "border-l-amber-500 bg-amber-500/5",
  cardio: "border-l-green-500 bg-green-500/5",
  photos: "border-l-purple-500 bg-purple-500/5",
  body_stats: "border-l-blue-500 bg-blue-500/5",
  steps: "border-l-orange-400 bg-orange-400/5",
  checkin: "border-l-purple-400 bg-purple-400/5",
  rest: "border-l-muted bg-muted/10",
  reminder: "border-l-yellow-500 bg-yellow-500/5",
  custom: "border-l-primary bg-primary/5",
};

const TYPE_ICON_COLOR: Record<string, string> = {
  workout: "text-amber-500",
  cardio: "text-green-500",
  photos: "text-purple-500",
  body_stats: "text-blue-500",
  steps: "text-orange-400",
  checkin: "text-purple-400",
  rest: "text-muted-foreground",
  reminder: "text-yellow-500",
  custom: "text-primary",
};

const TYPE_SUBTITLES: Record<string, string> = {
  workout: "Complete your scheduled workout",
  cardio: "Scheduled cardio session",
  photos: "Take your progress photos",
  body_stats: "Log body measurements",
  steps: "Reach your step goal",
  checkin: "Submit your weekly check-in",
  rest: "Recovery day",
  reminder: "Scheduled reminder",
};

interface CalendarDayListProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

function getDateLabel(dateStr: string): { label: string; isHighlighted: boolean; isDimmed: boolean } {
  const date = parseISO(dateStr);
  const suffix = (d: number) => {
    if (d > 3 && d < 21) return "th";
    switch (d % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
  };
  const day = date.getDate();
  const formatted = `${format(date, "MMMM")} ${day}${suffix(day)}`;

  if (isToday(date)) return { label: `Today, ${formatted}`, isHighlighted: true, isDimmed: false };
  if (isTomorrow(date)) return { label: `Tomorrow, ${formatted}`, isHighlighted: false, isDimmed: false };
  if (isYesterday(date)) return { label: `Yesterday, ${formatted}`, isHighlighted: false, isDimmed: true };
  if (date < new Date()) return { label: `${format(date, "EEEE")}, ${formatted}`, isHighlighted: false, isDimmed: true };
  return { label: `${format(date, "EEEE")}, ${formatted}`, isHighlighted: false, isDimmed: false };
}

const CalendarDayList = ({ events, onEventClick }: CalendarDayListProps) => {
  const todayRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const allDays = useMemo(() => {
    const start = subDays(today, 30);
    const end = addDays(today, 90);
    return eachDayOfInterval({ start, end }).map(d => format(d, "yyyy-MM-dd"));
  }, []);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(e => {
      if (!map[e.event_date]) map[e.event_date] = [];
      map[e.event_date].push(e);
    });
    // Sort events within each day: incomplete first, then by time
    Object.values(map).forEach(arr =>
      arr.sort((a, b) => {
        if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
        return (a.event_time || "").localeCompare(b.event_time || "");
      })
    );
    return map;
  }, [events]);

  useEffect(() => {
    // Scroll today into view on mount
    const timer = setTimeout(() => {
      todayRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const todayStr = format(today, "yyyy-MM-dd");

  return (
    <div className="space-y-1 pb-24">
      {allDays.map(dateStr => {
        const dayEvents = eventsByDate[dateStr] || [];
        const { label, isHighlighted, isDimmed } = getDateLabel(dateStr);
        const isTodayDate = dateStr === todayStr;

        return (
          <div key={dateStr} ref={isTodayDate ? todayRef : undefined}>
            {/* Date header */}
            <div className={cn(
              "sticky top-0 z-10 px-4 py-2.5 backdrop-blur-md",
              isHighlighted
                ? "bg-[hsl(var(--primary)/0.08)]"
                : "bg-background/90"
            )}>
              <h3 className={cn(
                "text-sm font-semibold",
                isHighlighted && "text-primary",
                isDimmed && "text-muted-foreground/60",
                !isHighlighted && !isDimmed && "text-foreground"
              )}>
                {label}
              </h3>
            </div>

            {/* Events or rest day */}
            <div className="px-4 pb-2">
              {dayEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 py-2 pl-1">Rest day</p>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map(event => (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className={cn(
                        "w-full text-left rounded-xl border-l-[3px] p-3 transition-colors",
                        TYPE_ACCENT[event.event_type] || TYPE_ACCENT.custom,
                        event.is_completed ? "opacity-60" : "hover:bg-secondary/40"
                      )}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Status icon */}
                        <div className="mt-0.5 shrink-0">
                          {event.is_completed ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground/30" />
                          )}
                        </div>

                        {/* Type icon */}
                        <div className={cn("mt-0.5 shrink-0", TYPE_ICON_COLOR[event.event_type] || TYPE_ICON_COLOR.custom)}>
                          {TYPE_ICONS[event.event_type] || TYPE_ICONS.reminder}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-semibold truncate",
                            event.is_completed && "line-through text-muted-foreground"
                          )}>
                            {event.title}
                          </p>
                          {event.description ? (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {event.description}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground/70 mt-0.5">
                              {TYPE_SUBTITLES[event.event_type] || "Scheduled task"}
                            </p>
                          )}
                          {event.event_time && (
                            <p className="text-[10px] text-muted-foreground/50 mt-1">
                              {event.event_time.slice(0, 5)}
                              {event.end_time && ` — ${event.end_time.slice(0, 5)}`}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {events.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm">Your coach hasn't scheduled anything yet.</p>
        </div>
      )}
    </div>
  );
};

export default CalendarDayList;
