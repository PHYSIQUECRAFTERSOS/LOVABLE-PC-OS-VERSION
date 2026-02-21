import type { OnboardingData } from "@/pages/Onboarding";
import { cn } from "@/lib/utils";
import { Target, Dumbbell, RefreshCw, Zap, HeartPulse, MoreHorizontal } from "lucide-react";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
}

const goals = [
  { value: "lose_fat", label: "Lose Body Fat", icon: Target, desc: "Reduce body fat while preserving muscle" },
  { value: "build_muscle", label: "Build Muscle", icon: Dumbbell, desc: "Gain lean mass and strength" },
  { value: "recomposition", label: "Recomposition", icon: RefreshCw, desc: "Lose fat and build muscle simultaneously" },
  { value: "improve_energy", label: "Improve Energy", icon: Zap, desc: "Optimize vitality and daily performance" },
  { value: "hormone_optimization", label: "Hormone Optimization", icon: HeartPulse, desc: "Balance hormones through lifestyle" },
  { value: "other", label: "Other", icon: MoreHorizontal, desc: "Something else — tell your coach" },
];

const OnboardingGoals = ({ data, updateField }: Props) => (
  <div className="space-y-6">
    <div>
      <h2 className="font-display text-2xl font-bold text-foreground">What's your primary goal?</h2>
      <p className="mt-1 text-sm text-muted-foreground">This helps us customize your program from day one.</p>
    </div>
    <div className="grid gap-3">
      {goals.map(({ value, label, icon: Icon, desc }) => (
        <button
          key={value}
          onClick={() => updateField("primary_goal", value)}
          className={cn(
            "flex items-center gap-4 rounded-xl border p-4 text-left transition-all",
            data.primary_goal === value
              ? "border-primary bg-primary/10 ring-1 ring-primary/30"
              : "border-border bg-card hover:border-muted-foreground/30"
          )}
        >
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            data.primary_goal === value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        </button>
      ))}
    </div>
  </div>
);

export default OnboardingGoals;
