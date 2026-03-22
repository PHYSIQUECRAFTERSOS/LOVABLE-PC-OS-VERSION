import { useXPHistory } from "@/hooks/useRanked";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Dumbbell,
  UtensilsCrossed,
  ClipboardCheck,
  Flame,
  AlertTriangle,
  Award,
  TrendingDown,
  Clock,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const ICONS: Record<string, any> = {
  workout_completed: Dumbbell,
  cardio_completed: Dumbbell,
  calories_on_target: UtensilsCrossed,
  protein_on_target: UtensilsCrossed,
  carbs_on_target: UtensilsCrossed,
  fats_on_target: UtensilsCrossed,
  checkin_submitted: ClipboardCheck,
  streak_bonus: Flame,
  coach_award: Award,
  missed_workout: AlertTriangle,
  missed_cardio: AlertTriangle,
  no_nutrition: AlertTriangle,
  calories_off_300: AlertTriangle,
  missed_checkin: AlertTriangle,
  decay: TrendingDown,
};

interface XPHistoryFeedProps {
  userId?: string;
}

const XPHistoryFeed = ({ userId }: XPHistoryFeedProps) => {
  const { data: history = [], isLoading } = useXPHistory(userId);

  if (isLoading)
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );

  if (!history.length)
    return (
      <p className="text-center text-sm text-muted-foreground py-6">
        No XP history yet. Start logging to earn XP!
      </p>
    );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <h3 className="px-4 py-3 text-sm font-semibold border-b border-border">
        XP History
      </h3>
      <div className="max-h-[400px] overflow-y-auto divide-y divide-border/50">
        {history.map((tx: any) => {
          const Icon = ICONS[tx.transaction_type] || Trophy;
          const isGain = tx.xp_amount > 0;
          const isCoach = tx.transaction_type === "coach_award";

          return (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <div
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full shrink-0",
                  isCoach
                    ? "bg-primary/10"
                    : isGain
                      ? "bg-emerald-500/10"
                      : "bg-red-500/10"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isCoach
                      ? "text-primary"
                      : isGain
                        ? "text-emerald-500"
                        : "text-red-500"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{tx.description}</p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(tx.created_at), "MMM d, h:mm a")}
                </p>
              </div>
              <span
                className={cn(
                  "text-sm font-bold shrink-0",
                  isCoach
                    ? "text-primary"
                    : isGain
                      ? "text-emerald-500"
                      : "text-red-500"
                )}
              >
                {isGain ? "+" : ""}
                {tx.xp_amount} XP
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default XPHistoryFeed;
