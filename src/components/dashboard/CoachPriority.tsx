import { ActionItem } from "./TodayActions";
import { Flame, Dumbbell, Heart, ClipboardCheck, Camera, Activity } from "lucide-react";

const PRIORITY_ORDER = ["workout", "checkin", "body_stats", "photos", "cardio", "nutrition", "steps"];
const PRIORITY_ICONS: Record<string, React.ReactNode> = {
  workout: <Dumbbell className="h-4 w-4" />,
  cardio: <Heart className="h-4 w-4" />,
  checkin: <ClipboardCheck className="h-4 w-4" />,
  photos: <Camera className="h-4 w-4" />,
  body_stats: <Activity className="h-4 w-4" />,
};

interface CoachPriorityProps {
  actions: ActionItem[];
  onActionClick?: (action: ActionItem) => void;
  label?: string;
}

const CoachPriority = ({ actions, onActionClick }: CoachPriorityProps) => {
  const incomplete = actions.filter((a) => !a.completed);
  if (incomplete.length === 0) return null;

  // Find highest priority incomplete action
  const priority = PRIORITY_ORDER.reduce<ActionItem | null>((best, type) => {
    if (best) return best;
    return incomplete.find((a) => a.type === type) || null;
  }, null) || incomplete[0];

  return (
    <button
      onClick={() => onActionClick?.(priority)}
      className="w-full flex items-center gap-3 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 transition-colors hover:bg-primary/15"
    >
      <Flame className="h-5 w-5 text-primary shrink-0" />
      <div className="text-left min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Priority Today</p>
        <p className="text-sm font-bold text-foreground truncate">{priority.title}</p>
      </div>
      <span className="text-muted-foreground shrink-0">
        {PRIORITY_ICONS[priority.type]}
      </span>
    </button>
  );
};

export default CoachPriority;
