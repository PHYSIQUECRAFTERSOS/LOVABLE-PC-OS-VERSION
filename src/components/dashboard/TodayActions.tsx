import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Dumbbell, Heart, UtensilsCrossed, Footprints, Camera, Activity, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";
import { cn } from "@/lib/utils";

export interface ActionItem {
  id: string;
  title: string;
  type: string;
  completed: boolean;
  detail?: string;
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

const TodayActions = ({ onDataLoaded }: { onDataLoaded?: (items: ActionItem[]) => void }) => {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: actions = [], loading } = useDataFetch<ActionItem[]>({
    queryKey: `today-actions-${user?.id}-${today}`,
    enabled: !!user,
    staleTime: 60 * 1000,
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];

      // Fetch all calendar events for today + workout sessions + cardio logs in parallel
      const [calRes, sessRes, cardioRes, nutritionRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id, title, event_type, is_completed, linked_workout_id")
          .eq("user_id", user.id)
          .eq("event_date", today)
          .order("event_time", { ascending: true })
          .abortSignal(signal),
        supabase
          .from("workout_sessions")
          .select("id, workout_id, completed_at, workouts:workout_id(name)")
          .eq("client_id", user.id)
          .gte("created_at", `${today}T00:00:00`)
          .lte("created_at", `${today}T23:59:59`)
          .abortSignal(signal),
        supabase
          .from("cardio_logs")
          .select("id, title, completed")
          .eq("client_id", user.id)
          .eq("logged_at", today)
          .abortSignal(signal),
        supabase
          .from("nutrition_logs")
          .select("id")
          .eq("client_id", user.id)
          .eq("logged_at", today)
          .limit(1)
          .abortSignal(signal),
      ]);

      const items: ActionItem[] = [];
      const linkedWorkoutIds = new Set<string>();

      // Calendar events first (source of truth)
      (calRes.data || []).forEach((e) => {
        if (e.linked_workout_id) linkedWorkoutIds.add(e.linked_workout_id);

        // Check if a workout session exists for this linked workout
        let completed = e.is_completed;
        if (e.event_type === "workout" && e.linked_workout_id) {
          const session = sessRes.data?.find((s) => s.workout_id === e.linked_workout_id);
          if (session?.completed_at) completed = true;
        }
        if (e.event_type === "cardio") {
          const log = cardioRes.data?.find((c) => c.title === e.title);
          if (log?.completed) completed = true;
        }

        items.push({
          id: e.id,
          title: e.title,
          type: e.event_type,
          completed,
        });
      });

      // Add workout sessions not already covered by calendar events
      sessRes.data?.forEach((s: any) => {
        if (!linkedWorkoutIds.has(s.workout_id)) {
          items.push({
            id: `ws-${s.id}`,
            title: s.workouts?.name || "Workout",
            type: "workout",
            completed: !!s.completed_at,
          });
        }
      });

      // Add cardio logs not already in calendar
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

      // Always show Track Nutrition action
      items.push({
        id: "nutrition-track",
        title: "Track Nutrition",
        type: "nutrition",
        completed: (nutritionRes.data?.length || 0) > 0,
      });

      // Notify parent of loaded data
      if (onDataLoaded) {
        setTimeout(() => onDataLoaded(items), 0);
      }

      return items;
    },
  });

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
            <div
              key={action.id}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                action.completed
                  ? "bg-primary/5"
                  : "hover:bg-secondary/50"
              )}
            >
              {action.completed ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
              )}
              <div className="flex items-center gap-2 min-w-0 flex-1">
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
              {action.detail && (
                <span className="text-xs text-muted-foreground shrink-0">{action.detail}</span>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default TodayActions;
