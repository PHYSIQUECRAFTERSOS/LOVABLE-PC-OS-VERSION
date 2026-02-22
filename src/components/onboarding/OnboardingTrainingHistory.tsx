import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  validationErrors: Record<string, string>;
}

const currentFreqOptions = [
  "0 days",
  "1–2 days",
  "3 days a week",
  "4 days a week",
  "5 days a week",
  "6+ days a week",
];

const realisticOptions = [
  "2 days a week",
  "3 days a week",
  "4 days a week",
  "5 days a week",
  "6 days a week",
  "Other",
];

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const OnboardingTrainingHistory = ({ data, updateField, validationErrors }: Props) => {
  const toggleDay = (day: string) => {
    const current = data.available_days || [];
    if (current.includes(day)) {
      updateField("available_days", current.filter((d) => d !== day));
    } else {
      updateField("available_days", [...current, day]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Training History</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your training background helps us set the right starting point.
        </p>
      </div>

      {/* Current frequency */}
      <div className="space-y-3">
        <Label>How many days per week have you been working out? <span className="text-destructive">*</span></Label>
        <div className="grid gap-2">
          {currentFreqOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => updateField("workout_days_current", opt)}
              className={cn(
                "rounded-lg border p-3 text-left text-sm font-medium transition-all",
                data.workout_days_current === opt
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        {validationErrors.workout_days_current && (
          <p className="text-xs text-destructive">{validationErrors.workout_days_current}</p>
        )}
      </div>

      {/* Realistic frequency */}
      <div className="space-y-3">
        <Label>How many days per week is realistic for you now? <span className="text-destructive">*</span></Label>
        <div className="grid gap-2">
          {realisticOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                updateField("workout_days_realistic", opt);
                if (opt !== "Other") updateField("workout_days_realistic_other", "");
              }}
              className={cn(
                "rounded-lg border p-3 text-left text-sm font-medium transition-all",
                data.workout_days_realistic === opt
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        {data.workout_days_realistic === "Other" && (
          <Input
            placeholder="Please specify..."
            value={data.workout_days_realistic_other || ""}
            onChange={(e) => updateField("workout_days_realistic_other", e.target.value)}
            className={cn("mt-2", validationErrors.workout_days_realistic_other && "border-destructive")}
          />
        )}
        {validationErrors.workout_days_realistic && (
          <p className="text-xs text-destructive">{validationErrors.workout_days_realistic}</p>
        )}
      </div>

      {/* Available days */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          What days can you workout? <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground">Select at least one day.</p>
        <div className="grid grid-cols-2 gap-2">
          {weekdays.map((day) => (
            <label
              key={day}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all",
                (data.available_days || []).includes(day)
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border bg-card hover:border-muted-foreground/30"
              )}
            >
              <Checkbox
                checked={(data.available_days || []).includes(day)}
                onCheckedChange={() => toggleDay(day)}
              />
              <span className="text-sm font-medium text-foreground">{day}</span>
            </label>
          ))}
        </div>
        {validationErrors.available_days && (
          <p className="text-xs text-destructive">{validationErrors.available_days}</p>
        )}
      </div>
    </div>
  );
};

export default OnboardingTrainingHistory;
