import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Dumbbell, Heart, UtensilsCrossed, Footprints, Camera, Activity, ClipboardCheck, Loader2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { useDataFetch, invalidateCache, invalidateCacheByPrefix } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import WorkoutStartPopup from "@/components/dashboard/WorkoutStartPopup";
import CardioPopup from "@/components/dashboard/CardioPopup";
import PhotosPopup from "@/components/dashboard/PhotosPopup";
import { useWorkoutLauncher } from "@/hooks/useWorkoutLauncher";
import { getLocalDateString } from "@/utils/localDate";
import { readSnapshotSlice, writeSnapshotSlice, type TodayActionsSlice } from "@/lib/dashboardSnapshot";


export interface ActionItem {
  id: string;
  title: string;
  type: string;
  completed: boolean;
  detail?: string;
  description?: string | null;
  linkedWorkoutId?: string | null;
  isAccessory?: boolean;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  workout: <Dumbbell className="h-4 w-4" />,
  activity: <Sparkles className="h-4 w-4" />,
  cardio: <Heart className="h-4 w-4" />,
  nutrition: <UtensilsCrossed className="h-4 w-4" />,
  steps: <Footprints className="h-4 w-4" />,
  photos: <Camera className="h-4 w-4" />,
  body_stats: <Activity className="h-4 w-4" />,
  checkin: <ClipboardCheck className="h-4 w-4" />,
  rest: <Circle className="h-4 w-4" />,
  reminder: <Circle className="h-4 w-4" />,
  custom: <Circle className="h-4 w-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  workout: "border-l-blue-500",
  activity: "border-l-muted-foreground/40",
  cardio: "border-l-green-500",
  nutrition: "border-l-yellow-500",
  steps: "border-l-orange-400",
  photos: "border-l-purple-500",
  body_stats: "border-l-orange-500",
  checkin: "border-l-purple-400",
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  workout: "Complete your scheduled workout",
  activity: "Scheduled activity",
  cardio: "Scheduled cardio session",
  nutrition: "Log your meals for today",
  steps: "Reach your step goal",
  photos: "Take your progress photos",
  body_stats: "Log body measurements",
  checkin: "Submit your weekly check-in",
};

const ACTION_ROUTES: Record<string, string> = {
  workout: "/training",
  cardio: "/training",
  nutrition: "/nutrition",
  steps: "/progress",
  photos: "/progress",
  body_stats: "/progress",
  checkin: "/progress",
};

interface TodayActionsProps {
  date?: string;
  onDataLoaded?: (items: ActionItem[]) => void;
  sectionTitle?: string;
}

const TodayActions = ({ date, onDataLoaded, sectionTitle = "Today's Actions" }: TodayActionsProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const targetDate = date || format(new Date(), "yyyy-MM-dd");
  const workoutLauncher = useWorkoutLauncher();

  // Popup state
  const [workoutPopup, setWorkoutPopup] = useState<{ workoutId: string; workoutName: string; calendarEventId: string } | null>(null);
  const [cardioPopup, setCardioPopup] = useState<{ eventId: string; title: string; description?: string | null } | null>(null);
  const [photosPopup, setPhotosPopup] = useState<{ eventId: string } | null>(null);

  // Stable cache key — no refreshKey to avoid race conditions
  const cacheKey = `today-actions-${user?.id}-${targetDate}`;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  const refetchRef = useRef<(() => void) | null>(null);

  // Listen for FAB-scheduled events and realtime changes to refetch instantly
  useEffect(() => {
    const cachePrefix = `today-actions-${user?.id}-`;

    const handler = () => {
      // Invalidate ALL date caches for this user so any date strip tap gets fresh data
      invalidateCacheByPrefix(cachePrefix);
      setTimeout(() => refetchRef.current?.(), 300);
      setTimeout(() => refetchRef.current?.(), 1000);
      setTimeout(() => refetchRef.current?.(), 2500);
    };
    window.addEventListener("calendar-event-added", handler);

    // Realtime subscription for instant updates when coach schedules or client drags
    const channel = supabase
      .channel(`today-actions-rt-${user?.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_events",
        },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (row?.user_id === user?.id || row?.target_client_id === user?.id) {
            // Invalidate ALL date caches — the event may have moved between dates
            invalidateCacheByPrefix(cachePrefix);
            setTimeout(() => refetchRef.current?.(), 300);
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("calendar-event-added", handler);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const { data: actions = [], loading, refetch } = useDataFetch<ActionItem[]>({
    queryKey: cacheKey,
    enabled: !!user,
    staleTime: 60 * 1000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];

      // Calendar is the source of truth — only show items scheduled for this date
      const [calSettled, cardioSettled, nutritionSettled] = await Promise.allSettled([
        supabase
          .from("calendar_events")
          .select("id, title, event_type, is_completed, linked_workout_id, description")
          .or(`user_id.eq.${user.id},target_client_id.eq.${user.id}`)
          .eq("event_date", targetDate)
          .neq("event_type", "auto_message")
          .order("event_time", { ascending: true })
          .abortSignal(signal),
        supabase
          .from("cardio_logs")
          .select("id, title, completed")
          .eq("client_id", user.id)
          .eq("logged_at", targetDate)
          .abortSignal(signal),
        supabase
          .from("nutrition_logs")
          .select("id")
          .eq("client_id", user.id)
          .eq("logged_at", targetDate)
          .limit(1)
          .abortSignal(signal),
      ]);

      const calRes = calSettled.status === "fulfilled" ? calSettled.value : { data: null };
      const cardioRes = cardioSettled.status === "fulfilled" ? cardioSettled.value : { data: null };
      const nutritionRes = nutritionSettled.status === "fulfilled" ? nutritionSettled.value : { data: null };

      // Collect linked workout IDs from today's calendar events to check completion
      const calWorkoutIds = (calRes.data || [])
        .filter(e => e.event_type === "workout" && e.linked_workout_id)
        .map(e => e.linked_workout_id!);

      // Fetch workout sessions + names only for workouts actually scheduled today
      const [sessSettled, workoutNamesSettled] = await Promise.allSettled([
        calWorkoutIds.length > 0
          ? supabase
              .from("workout_sessions")
              .select("id, workout_id, completed_at")
              .eq("client_id", user.id)
              .eq("status", "completed")
              .in("workout_id", calWorkoutIds)
              .gte("created_at", `${targetDate}T00:00:00`)
              .lte("created_at", `${targetDate}T23:59:59`)
              .abortSignal(signal)
          : Promise.resolve({ data: [] as any[], error: null }),
        calWorkoutIds.length > 0
          ? supabase
              .from("workouts")
              .select("id, name, is_accessory")
              .in("id", calWorkoutIds)
              .abortSignal(signal)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      const sessRes = sessSettled.status === "fulfilled" ? sessSettled.value : { data: [] as any[] };
      const workoutNamesRes = workoutNamesSettled.status === "fulfilled" ? workoutNamesSettled.value : { data: [] as any[] };


      const items: ActionItem[] = [];

      const workoutNameMap = new Map<string, string>();
      const workoutAccessoryMap = new Map<string, boolean>();
      (workoutNamesRes.data || []).forEach((w: any) => {
        workoutNameMap.set(w.id, w.name);
        workoutAccessoryMap.set(w.id, !!w.is_accessory);
      });

      (calRes.data || []).forEach((e) => {
        let completed = e.is_completed;
        let title = e.title;
        let isAccessory = false;

        if (e.event_type === "workout" && e.linked_workout_id) {
          const session = sessRes.data?.find((s: any) => s.workout_id === e.linked_workout_id);
          if (session?.completed_at) completed = true;
          const directName = workoutNameMap.get(e.linked_workout_id);
          if (directName) title = directName;
          isAccessory = workoutAccessoryMap.get(e.linked_workout_id) === true;
          // Strip any leftover "Day N:" prefix from accessory titles
          if (isAccessory) {
            title = title.replace(/^[Dd]ay\s*\d+\s*[:\-–]\s*/, "").trim();
          }
        }
        if (e.event_type === "cardio") {
          const log = cardioRes.data?.find((c) => c.title === e.title);
          if (log?.completed) completed = true;
        }

        items.push({
          id: e.id,
          title,
          type: isAccessory ? "activity" : e.event_type,
          completed,
          description: (e as any).description || null,
          linkedWorkoutId: e.linked_workout_id,
          isAccessory,
        });
      });

      cardioRes.data?.forEach((c) => {
        if (!items.some((i) => i.type === "cardio" && i.title === c.title)) {
          items.push({
            id: `cl-${c.id}`,
            title: c.title,
            type: "cardio",
            completed: c.completed,
          });
        }
      });

      // Deduplicate only true duplicates: multiple calendar events pointing to the
      // SAME linked workout. Distinct workouts (and accessories) on the same day stay.
      const seenByLinkedId = new Map<string, ActionItem>();
      const dropIds = new Set<string>();
      for (const it of items) {
        if ((it.type === "workout" || it.type === "activity") && it.linkedWorkoutId) {
          const existing = seenByLinkedId.get(it.linkedWorkoutId);
          if (!existing) {
            seenByLinkedId.set(it.linkedWorkoutId, it);
          } else {
            // Keep the named one; drop the generic "Workout" placeholder
            const existingIsGeneric = existing.title === "Workout";
            const currentIsGeneric = it.title === "Workout";
            if (existingIsGeneric && !currentIsGeneric) {
              dropIds.add(existing.id);
              seenByLinkedId.set(it.linkedWorkoutId, it);
            } else {
              dropIds.add(it.id);
            }
          }
        }
      }
      if (dropIds.size > 0) {
        const filtered = items.filter(i => !dropIds.has(i.id));
        items.length = 0;
        items.push(...filtered);
      }

      items.push({
        id: "nutrition-track",
        title: "Track Nutrition",
        type: "nutrition",
        completed: (nutritionRes.data?.length || 0) > 0,
      });

      return items;
    },
  });

  // Fire onDataLoaded whenever data updates (including cache hits and refetches)
  useEffect(() => {
    if (onDataLoaded && actions.length > 0) {
      onDataLoaded(actions);
    }
  }, [actions, onDataLoaded]);

  refetchRef.current = refetch;

  // Resolve the effective type from event_type + title keywords
  const resolveActionType = (action: ActionItem): string => {
    const t = action.type;
    if (t === "body_stats" || t === "photos" || t === "checkin" || t === "workout" || t === "cardio") return t;
    // Title-based normalization for custom/rest events
    const titleLower = action.title.toLowerCase();
    if (titleLower.includes("body stat") || titleLower.includes("bodystats")) return "body_stats";
    if (titleLower.includes("photo") || titleLower.includes("progress pic")) return "photos";
    if (titleLower.includes("check-in") || titleLower.includes("checkin")) return "checkin";
    return t;
  };

  const handleActionClick = (action: ActionItem) => {
    const effectiveType = resolveActionType(action);

    // Workout or accessory activity: open popup if there's a linked workout
    if ((effectiveType === "workout" || effectiveType === "activity") && action.linkedWorkoutId && !action.completed) {
      setWorkoutPopup({ workoutId: action.linkedWorkoutId, workoutName: action.title, calendarEventId: action.id });
      return;
    }
    // Cardio: open popup if not completed
    if (effectiveType === "cardio" && !action.completed) {
      setCardioPopup({ eventId: action.id, title: action.title, description: action.description });
      return;
    }
    // Body Stats: navigate to full page
    if (effectiveType === "body_stats" && !action.completed) {
      navigate(`/body-stats?eventId=${action.id}`);
      return;
    }
    // Photos: open full-page flow
    if (effectiveType === "photos" && !action.completed) {
      setPhotosPopup({ eventId: action.id });
      return;
    }
    // Check-in: navigate to progress check-in tab
    if (effectiveType === "checkin" && !action.completed) {
      navigate("/progress?tab=checkin");
      return;
    }
    // Default: navigate
    const route = ACTION_ROUTES[action.type];
    if (route) navigate(route);
  };

  // Launch workout directly as a fullscreen overlay — no Training tab navigation.
  const handleStartWorkout = (workoutId: string, calendarEventId?: string) => {
    workoutLauncher.launch(workoutId, calendarEventId);
  };

  const handleCardioCompleted = () => {
    setCardioPopup(null);
    invalidateCache(cacheKey);
    refetch();
  };

  const handlePhotosCompleted = () => {
    invalidateCache(cacheKey);
    refetch();
  };

  if (loading) return <CardSkeleton lines={5} />;

  const completedCount = actions.filter((a) => a.completed).length;
  const totalCount = actions.length;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold">{sectionTitle}</CardTitle>
            <span className="text-sm font-semibold text-primary">
              {completedCount}/{totalCount}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No actions scheduled today. Enjoy your rest!</p>
          ) : (
            actions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleActionClick(action)}
                disabled={workoutLauncher.loading && (action.type === "workout" || action.type === "activity")}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors w-full text-left border-l-[3px]",
                  TYPE_COLORS[action.type] || "border-l-muted",
                  action.type === "activity" && !action.completed && "bg-muted/10",
                  action.completed
                    ? "bg-primary/5 opacity-70"
                    : "hover:bg-secondary/50"
                )}
              >
                {workoutLauncher.loading && (action.type === "workout" || action.type === "activity") && !action.completed ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                ) : action.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                )}
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground shrink-0">
                      {TYPE_ICONS[action.type] || TYPE_ICONS.custom}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-medium truncate",
                        action.completed
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      )}
                    >
                      {action.title}
                    </span>
                  </div>
                  {!action.completed && (
                    <span className="text-[10px] text-muted-foreground ml-6 truncate">
                      {TYPE_DESCRIPTIONS[action.type] || "Scheduled task"}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {/* Workout Start Popup */}
      {workoutPopup && (
        <WorkoutStartPopup
          open={true}
          onClose={() => setWorkoutPopup(null)}
          workoutId={workoutPopup.workoutId}
          workoutName={workoutPopup.workoutName}
          calendarEventId={workoutPopup.calendarEventId}
          onStartWorkout={handleStartWorkout}
        />
      )}

      {/* Cardio Popup */}
      {cardioPopup && (
        <CardioPopup
          open={true}
          onClose={() => setCardioPopup(null)}
          eventId={cardioPopup.eventId}
          title={cardioPopup.title}
          description={cardioPopup.description}
          onCompleted={handleCardioCompleted}
        />
      )}

      {/* Photos Popup */}
      {photosPopup && (
        <PhotosPopup
          open={true}
          onClose={() => setPhotosPopup(null)}
          eventId={photosPopup.eventId}
          onCompleted={handlePhotosCompleted}
        />
      )}

      {/* Workout Logger Overlay — renders fullscreen without navigating to Training */}
      {workoutLauncher.WorkoutOverlay}
    </>
  );
};

export default TodayActions;
