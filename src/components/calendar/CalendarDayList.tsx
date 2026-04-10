import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { format, isToday, isTomorrow, isYesterday, parseISO, eachDayOfInterval, subDays, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarEvent } from "./CalendarGrid";
import { CheckCircle2, Circle, Dumbbell, Heart, Camera, Activity, Footprints, ClipboardCheck, Moon, Bell, UtensilsCrossed, GripVertical } from "lucide-react";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  workout: <Dumbbell className="h-5 w-5" />,
  cardio: <Heart className="h-5 w-5" />,
  photos: <Camera className="h-5 w-5" />,
  body_stats: <Activity className="h-5 w-5" />,
  steps: <Footprints className="h-5 w-5" />,
  checkin: <ClipboardCheck className="h-5 w-5" />,
  rest: <Moon className="h-5 w-5" />,
  reminder: <Bell className="h-5 w-5" />,
  nutrition: <UtensilsCrossed className="h-5 w-5" />,
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
  nutrition: "border-l-red-500 bg-red-500/5",
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
  nutrition: "text-red-500",
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
  nutrition: "Daily nutrition intake",
};

interface CalendarDayListProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onEventMoved?: (eventId: string, newDate: string) => void;
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

/** Check if event is a real DB event that can be moved (not a synced/virtual one) */
function isDraggable(event: CalendarEvent): boolean {
  if (event.id.startsWith("ws-") || event.id.startsWith("cl-") || event.id.startsWith("nut-")) return false;
  // Cardio and completed events should not be draggable
  if (event.event_type === "cardio" || event.is_completed) return false;
  return true;
}

const LONG_PRESS_MS = 400;
const AUTO_SCROLL_ZONE = 60; // px from edge
const AUTO_SCROLL_SPEED = 6; // px per frame
const MIN_DRAG_DISTANCE = 30; // px — must drag at least this far from start to accept a different drop target

const CalendarDayList = ({ events, onEventClick, onEventMoved }: CalendarDayListProps) => {
  const todayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dayHeaderRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Drag state – refs for native listeners, state only for rendering
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragEvent, setDragEvent] = useState<CalendarEvent | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const autoScrollRaf = useRef<number | null>(null);
  const dragCardRef = useRef<HTMLDivElement | null>(null);
  // Keep current drag state in refs so native listeners can access them
  const dragEventRef = useRef<CalendarEvent | null>(null);
  const dropTargetRef = useRef<string | null>(null);

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
    Object.values(map).forEach(arr =>
      arr.sort((a, b) => {
        if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
        return (a.event_time || "").localeCompare(b.event_time || "");
      })
    );
    return map;
  }, [events]);

  useEffect(() => {
    const timer = setTimeout(() => {
      todayRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const todayStr = format(today, "yyyy-MM-dd");

  // --- Drag helpers ---

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRaf.current) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }, []);

  const findDropTarget = useCallback((clientY: number): string | null => {
    let closest: string | null = null;
    let closestDist = Infinity;
    dayHeaderRefs.current.forEach((el, dateStr) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(clientY - (rect.top + rect.height / 2));
      if (clientY >= rect.top - 10 && dist < closestDist) {
        closestDist = dist;
        closest = dateStr;
      }
    });
    if (!closest) {
      let lastDate: string | null = null;
      let lastTop = -Infinity;
      dayHeaderRefs.current.forEach((el, dateStr) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < clientY && rect.top > lastTop) {
          lastTop = rect.top;
          lastDate = dateStr;
        }
      });
      closest = lastDate;
    }
    return closest;
  }, []);

  const startAutoScroll = useCallback((clientY: number) => {
    stopAutoScroll();
    const scrollEl = containerRef.current?.closest('[class*="overflow-y"]') as HTMLElement | null;

    const doScroll = () => {
      const vh = window.innerHeight;
      if (scrollEl) {
        if (clientY < AUTO_SCROLL_ZONE) scrollEl.scrollTop -= AUTO_SCROLL_SPEED;
        else if (clientY > vh - AUTO_SCROLL_ZONE) scrollEl.scrollTop += AUTO_SCROLL_SPEED;
      } else {
        if (clientY < AUTO_SCROLL_ZONE) window.scrollBy(0, -AUTO_SCROLL_SPEED);
        else if (clientY > vh - AUTO_SCROLL_ZONE) window.scrollBy(0, AUTO_SCROLL_SPEED);
      }
      autoScrollRaf.current = requestAnimationFrame(doScroll);
    };

    if (clientY < AUTO_SCROLL_ZONE || clientY > window.innerHeight - AUTO_SCROLL_ZONE) {
      autoScrollRaf.current = requestAnimationFrame(doScroll);
    }
  }, [stopAutoScroll]);

  const endDrag = useCallback(() => {
    clearLongPress();
    stopAutoScroll();

    const ev = dragEventRef.current;
    const target = dropTargetRef.current;

    // Only move if finger actually traveled a meaningful distance from the drag start point.
    // This prevents accidental moves when the user just long-pressed without truly dragging.
    let draggedFarEnough = false;
    if (ev && target && target !== ev.event_date && onEventMoved && dragStartPos.current) {
      // We need current finger position — stored in dragPos state
      // If no drag position recorded (finger barely moved), skip
      const lastPos = dragStartPos.current;
      // Check the last known drag position from setDragPos
      const el = dragCardRef.current;
      if (el) {
        const style = el.style;
        const currentY = parseFloat(style.top || "0") + 30; // compensate offset
        const dy = Math.abs(currentY - lastPos.y);
        const dx = 0; // we only care about vertical distance for day changes
        draggedFarEnough = dy >= MIN_DRAG_DISTANCE;
      }
    }

    if (ev && target && target !== ev.event_date && onEventMoved && draggedFarEnough) {
      onEventMoved(ev.id, target);
    }

    dragEventRef.current = null;
    dropTargetRef.current = null;
    setDragEvent(null);
    setDragPos(null);
    setDropTargetDate(null);
    // Do NOT reset didDrag here — keep it true so the subsequent onClick is suppressed.
    // It will be reset on the next touchstart/mousedown.
    dragStartPos.current = null;
    document.body.style.userSelect = "";
  }, [onEventMoved, clearLongPress, stopAutoScroll]);

  // ---- NATIVE touch listeners (non-passive) to reliably preventDefault on iOS ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];

      // If not yet in drag mode, check if finger moved too far and cancel long press
      if (!dragEventRef.current) {
        if (dragStartPos.current) {
          const dx = Math.abs(touch.clientX - dragStartPos.current.x);
          const dy = Math.abs(touch.clientY - dragStartPos.current.y);
          if (dx > 10 || dy > 10) {
            clearLongPress();
          }
        }
        return;
      }

      // In drag mode — prevent ALL scroll
      e.preventDefault();
      e.stopPropagation();

      setDragPos({ x: touch.clientX, y: touch.clientY });
      const target = findDropTarget(touch.clientY);
      if (target) {
        dropTargetRef.current = target;
        setDropTargetDate(target);
      }
      startAutoScroll(touch.clientY);
    };

    const onTouchEnd = () => {
      clearLongPress();
      if (dragEventRef.current) {
        endDrag();
        // Keep didDrag.current = true so the subsequent onClick is suppressed.
        // It will be reset on the next handleTouchStart.
        dragStartPos.current = null;
        return;
      }
      didDrag.current = false;
      dragStartPos.current = null;
    };

    // Register as NON-PASSIVE so preventDefault works on iOS Safari
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);

    return () => {
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [clearLongPress, endDrag, findDropTarget, startAutoScroll]);

  // Touch start still via React (only sets up the long-press timer)
  const handleTouchStart = useCallback((e: React.TouchEvent, event: CalendarEvent) => {
    if (!isDraggable(event)) return;

    const touch = e.touches[0];
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    didDrag.current = false;

    longPressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(30);

      dragEventRef.current = event;
      dropTargetRef.current = event.event_date;
      setDragEvent(event);
      setDragPos({ x: touch.clientX, y: touch.clientY });
      setDropTargetDate(event.event_date);
      didDrag.current = true;
      document.body.style.userSelect = "none";
    }, LONG_PRESS_MS);
  }, []);

  const handleClick = useCallback((event: CalendarEvent) => {
    if (!didDrag.current) {
      onEventClick(event);
    }
  }, [onEventClick]);

  // Mouse drag support (desktop)
  const handleMouseDown = useCallback((e: React.MouseEvent, event: CalendarEvent) => {
    if (!isDraggable(event)) return;

    dragStartPos.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;

    longPressTimer.current = setTimeout(() => {
      dragEventRef.current = event;
      dropTargetRef.current = event.event_date;
      setDragEvent(event);
      setDragPos({ x: e.clientX, y: e.clientY });
      setDropTargetDate(event.event_date);
      didDrag.current = true;
      document.body.style.userSelect = "none";
    }, LONG_PRESS_MS);
  }, []);

  useEffect(() => {
    if (!dragEvent) return;

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      setDragPos({ x: e.clientX, y: e.clientY });
      const target = findDropTarget(e.clientY);
      if (target) {
        dropTargetRef.current = target;
        setDropTargetDate(target);
      }
      startAutoScroll(e.clientY);
    };

    const onMouseUp = () => endDrag();

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragEvent, endDrag, findDropTarget, startAutoScroll]);

  // Cancel long press on any scroll (only when not actively dragging)
  useEffect(() => {
    const onScroll = () => {
      if (!dragEventRef.current) clearLongPress();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [clearLongPress]);

  // Store day header refs
  const setDayHeaderRef = useCallback((dateStr: string, el: HTMLDivElement | null) => {
    if (el) {
      dayHeaderRefs.current.set(dateStr, el);
    } else {
      dayHeaderRefs.current.delete(dateStr);
    }
  }, []);

  return (
    <div className="space-y-1 pb-24 relative" ref={containerRef}>
      {allDays.map(dateStr => {
        const dayEvents = eventsByDate[dateStr] || [];
        const { label, isHighlighted, isDimmed } = getDateLabel(dateStr);
        const isTodayDate = dateStr === todayStr;
        const isDropTarget = dragEvent && dropTargetDate === dateStr && dateStr !== dragEvent.event_date;

        return (
          <div key={dateStr} ref={isTodayDate ? todayRef : undefined}>
            {/* Date header */}
            <div
              ref={(el) => setDayHeaderRef(dateStr, el)}
              data-date={dateStr}
              className={cn(
                "sticky top-0 z-10 px-4 py-2.5 backdrop-blur-md transition-colors duration-150",
                isHighlighted
                  ? "bg-[hsl(var(--primary)/0.08)]"
                  : "bg-background/90",
                isDropTarget && "bg-primary/20 ring-2 ring-primary/40 ring-inset rounded-lg"
              )}
            >
              <h3 className={cn(
                "text-sm font-semibold",
                isHighlighted && "text-primary",
                isDimmed && "text-muted-foreground/60",
                !isHighlighted && !isDimmed && "text-foreground",
                isDropTarget && "text-primary"
              )}>
                {label}
                {isDropTarget && (
                  <span className="ml-2 text-xs font-normal text-primary/80">↓ Drop here</span>
                )}
              </h3>
            </div>

            {/* Events or rest day */}
            <div className="px-4 pb-2">
              {dayEvents.length === 0 ? (
                <div className={cn(
                  "py-2 pl-1 transition-colors duration-150 rounded",
                  isDropTarget && "bg-primary/10"
                )}>
                  <p className="text-xs text-muted-foreground/50">Rest day</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map(event => {
                    const beingDragged = dragEvent?.id === event.id;
                    const canDrag = isDraggable(event);
                    
                    return (
                      <div
                        key={event.id}
                        onTouchStart={canDrag ? (e) => handleTouchStart(e, event) : undefined}
                        onMouseDown={canDrag ? (e) => handleMouseDown(e, event) : undefined}
                        onClick={() => handleClick(event)}
                        className={cn(
                          "w-full text-left rounded-xl border-l-[3px] p-3 transition-all cursor-pointer select-none",
                          TYPE_ACCENT[event.event_type] || TYPE_ACCENT.custom,
                          event.is_completed ? "opacity-60" : "hover:bg-secondary/40",
                          beingDragged && "opacity-30 scale-95",
                          canDrag && !dragEvent && "active:scale-[0.98]"
                        )}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Drag handle hint */}
                          {canDrag && (
                            <div className="mt-1 shrink-0 text-muted-foreground/20">
                              <GripVertical className="h-4 w-4" />
                            </div>
                          )}
                          
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
                      </div>
                    );
                  })}
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

      {/* Floating drag ghost */}
      {dragEvent && dragPos && (
        <div
          ref={dragCardRef}
          className="fixed z-50 pointer-events-none w-[calc(100vw-64px)] max-w-md"
          style={{
            left: 32,
            top: dragPos.y - 30,
            transform: "scale(1.03)",
          }}
        >
          <div className={cn(
            "rounded-xl border-l-[3px] p-3 shadow-2xl shadow-black/40 backdrop-blur-sm bg-card/95 border border-border",
            TYPE_ACCENT[dragEvent.event_type] || TYPE_ACCENT.custom,
          )}>
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-1 shrink-0 text-primary">
                <GripVertical className="h-4 w-4" />
              </div>
              <div className="mt-0.5 shrink-0">
                {dragEvent.is_completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30" />
                )}
              </div>
              <div className={cn("mt-0.5 shrink-0", TYPE_ICON_COLOR[dragEvent.event_type] || TYPE_ICON_COLOR.custom)}>
                {TYPE_ICONS[dragEvent.event_type] || TYPE_ICONS.reminder}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{dragEvent.title}</p>
                <p className="text-xs text-primary mt-0.5">
                  {dropTargetDate && dropTargetDate !== dragEvent.event_date
                    ? `Move to ${format(parseISO(dropTargetDate), "MMM d")}`
                    : "Drag to reschedule"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarDayList;
