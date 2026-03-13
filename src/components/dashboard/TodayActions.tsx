import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Dumbbell, Heart, UtensilsCrossed, Footprints, Camera, Activity, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { useDataFetch, invalidateCache } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import WorkoutStartPopup from "@/components/dashboard/WorkoutStartPopup";
import CardioPopup from "@/components/dashboard/CardioPopup";
import PhotosPopup from "@/components/dashboard/PhotosPopup";

export interface ActionItem {
  id: string;
  title: string;
  type: string;
  completed: boolean;
  detail?: string;
  description?: string | null;
  linkedWorkoutId?: string | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  workout: <Dumbbell className="h-4 w-4" />,
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
  cardio: "border-l-green-500",
  nutrition: "border-l-yellow-500",
  steps: "border-l-orange-400",
  photos: "border-l-purple-500",
  body_stats: "border-l-orange-500",
  checkin: "border-l-purple-400",
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  workout: "Complete your scheduled workout",
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
}

const TodayActions = ({ date, onDataLoaded }: TodayActionsProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const targetDate = date || format(new Date(), "yyyy-MM-dd");

  // Popup state
  const [workoutPopup, setWorkoutPopup] = useState<{ workoutId: string; workoutName: string; calendarEventId: string } | null>(null);
  const [cardioPopup, setCardioPopup] = useState<{ eventId: string; title: string; description?: string | null } | null>(null);
  const [photosPopup, setPhotosPopup] = useState<{ eventId: string } | null>(null);

  const cacheKey = `today-actions-${user?.id}-${targetDate}`;

  const { data: actions = [], loading } = useDataFetch<ActionItem[]>({
    queryKey: cacheKey,
    enabled: !!user,
    staleTime: 60 * 1000,
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];

      const [calRes, sessRes, cardioRes, nutritionRes, linkedWorkoutsRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id, title, event_type, is_completed, linked_workout_id, description")
          .or(`user_id.eq.${user.id},target_client_id.eq.${user.id}`)
          .eq("event_date", targetDate)
          .order("event_time", { ascending: true })
          .abortSignal(signal),
        supabase
          .from("workout_sessions")
          .select("id, workout_id, completed_at, workouts:workout_id(name)")
          .eq("client_id", user.id)
          .gte("created_at", `${targetDate}T00:00:00`)
          .lte("created_at", `${targetDate}T23:59:59`)
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
        supabase
          .from("workouts")
          .select("id, name")
          .abortSignal(signal),
      ]);

      const items: ActionItem[] = [];
      const linkedWorkoutIds = new Set<string>();

      const workoutNameMap = new Map<string, string>();
      (linkedWorkoutsRes.data || []).forEach((w: any) => {
        workoutNameMap.set(w.id, w.name);
      });

      (calRes.data || []).forEach((e) => {
        if (e.linked_workout_id) linkedWorkoutIds.add(e.linked_workout_id);

        let completed = e.is_completed;
        let title = e.title;

        if (e.event_type === "workout" && e.linked_workout_id) {
          const session = sessRes.data?.find((s) => s.workout_id === e.linked_workout_id);
          if (session?.completed_at) completed = true;
          const sessionName = (session as any)?.workouts?.name;
          const directName = workoutNameMap.get(e.linked_workout_id);
          const workoutName = sessionName || directName;
          if (workoutName) title = workoutName;
        }
        if (e.event_type === "cardio") {
          const log = cardioRes.data?.find((c) => c.title === e.title);
          if (log?.completed) completed = true;
        }

        items.push({
          id: e.id,
          title,
          type: e.event_type,
          completed,
          description: (e as any).description || null,
          linkedWorkoutId: e.linked_workout_id,
        });
      });

      sessRes.data?.forEach((s: any) => {
        if (!linkedWorkoutIds.has(s.workout_id)) {
          items.push({
            id: `ws-${s.id}`,
            title: s.workouts?.name || "Workout",
            type: "workout",
            completed: !!s.completed_at,
            linkedWorkoutId: s.workout_id,
          });
        }
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

      // Deduplicate workout items
      const workoutItems = items.filter(i => i.type === "workout");
      if (workoutItems.length > 1) {
        const named = workoutItems.find(w => w.title !== "Workout") || workoutItems[0];
        const duplicateIds = new Set(workoutItems.filter(w => w.id !== named.id).map(w => w.id));
        const filtered = items.filter(i => !duplicateIds.has(i.id));
        items.length = 0;
        items.push(...filtered);
      }

      items.push({
        id: "nutrition-track",
        title: "Track Nutrition",
        type: "nutrition",
        completed: (nutritionRes.data?.length || 0) > 0,
      });

      if (onDataLoaded) {
        setTimeout(() => onDataLoaded(items), 0);
      }

      return items;
    },
  });

  const handleActionClick = (action: ActionItem) => {
    // Workout: open popup if there's a linked workout
    if (action.type === "workout" && action.linkedWorkoutId && !action.completed) {
      setWorkoutPopup({ workoutId: action.linkedWorkoutId, workoutName: action.title, calendarEventId: action.id });
      return;
    }
    // Cardio: open popup if not completed
    if (action.type === "cardio" && !action.completed) {
      setCardioPopup({ eventId: action.id, title: action.title, description: action.description });
      return;
    }
    // Body Stats: navigate to full page
    if (action.type === "body_stats" && !action.completed) {
      navigate(`/body-stats?eventId=${action.id}`);
      return;
    }
    // Photos: open popup
    if (action.type === "photos" && !action.completed) {
      setPhotosPopup({ eventId: action.id });
      return;
    }
    // Default: navigate
    const route = ACTION_ROUTES[action.type];
    if (route) navigate(route);
  };

  const handleStartWorkout = (workoutId: string, calendarEventId?: string) => {
    navigate("/training", { state: { startWorkoutId: workoutId, calendarEventId } });
  };

  const handleCardioCompleted = () => {
    invalidateCache(cacheKey);
  };

  const handleBodyStatsCompleted = () => {
    invalidateCache(cacheKey);
  };

  const handlePhotosCompleted = () => {
    invalidateCache(cacheKey);
  };

  if (loading) return <CardSkeleton lines={5} />;

  const completedCount = actions.filter((a) => a.completed).length;
  const totalCount = actions.length;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold">Today's Actions</CardTitle>
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
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors w-full text-left border-l-[3px]",
                  TYPE_COLORS[action.type] || "border-l-muted",
                  action.completed
                    ? "bg-primary/5 opacity-70"
                    : "hover:bg-secondary/50"
                )}
              >
                {action.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
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

      {/* Body Stats Popup */}
      {bodyStatsPopup && (
        <BodyStatsPopup
          open={true}
          onClose={() => setBodyStatsPopup(null)}
          eventId={bodyStatsPopup.eventId}
          onCompleted={handleBodyStatsCompleted}
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
    </>
  );
};

export default TodayActions;
