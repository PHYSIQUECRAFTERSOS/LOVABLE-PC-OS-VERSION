import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Dumbbell, Heart, UtensilsCrossed, Footprints, Camera, Activity, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export interface ActionItem {
  id: string;
  title: string;
  type: string;
  completed: boolean;
  detail?: string;
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

  const { data: actions = [], loading } = useDataFetch<ActionItem[]>({
    queryKey: `today-actions-${user?.id}-${targetDate}`,
    enabled: !!user,
    staleTime: 60 * 1000,
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];

      const [calRes, sessRes, cardioRes, nutritionRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id, title, event_type, is_completed, linked_workout_id")
          .eq("user_id", user.id)
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
      ]);

      const items: ActionItem[] = [];
      const linkedWorkoutIds = new Set<string>();

      (calRes.data || []).forEach((e) => {
        if (e.linked_workout_id) linkedWorkoutIds.add(e.linked_workout_id);

        let completed = e.is_completed;
        let title = e.title;

        if (e.event_type === "workout" && e.linked_workout_id) {
          const session = sessRes.data?.find((s) => s.workout_id === e.linked_workout_id);
          if (session?.completed_at) completed = true;
          // Use real workout name instead of generic "Workout"
          const workoutName = (session as any)?.workouts?.name;
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

      // Deduplicate: keep max 1 workout-type item (prefer named over generic)
      const workoutItems = items.filter(i => i.type === "workout");
      if (workoutItems.length > 1) {
        // Prefer named workouts (not "Workout")
        const named = workoutItems.find(w => w.title !== "Workout") || workoutItems[0];
        // Remove all workout items except the preferred one
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
    const route = ACTION_ROUTES[action.type];
    if (route) navigate(route);
  };

  if (loading) return <CardSkeleton lines={5} />;

  const completedCount = actions.filter((a) => a.completed).length;
  const totalCount = actions.length;

  return (
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
  );
};

export default TodayActions;
