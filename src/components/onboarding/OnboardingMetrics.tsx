import type { OnboardingData } from "@/pages/Onboarding";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
}

const activityLevels = [
  { value: "sedentary", label: "Sedentary", desc: "Desk job, little exercise" },
  { value: "lightly_active", label: "Lightly Active", desc: "1-2 workouts/week" },
  { value: "moderately_active", label: "Moderately Active", desc: "3-5 workouts/week" },
  { value: "very_active", label: "Very Active", desc: "6-7 workouts/week + active job" },
];

const OnboardingMetrics = ({ data, updateField }: Props) => (
  <div className="space-y-6">
    <div>
      <h2 className="font-display text-2xl font-bold text-foreground">Body Metrics</h2>
      <p className="mt-1 text-sm text-muted-foreground">We use this to calculate your baseline targets.</p>
    </div>

    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Age</Label>
        <Input
          type="number"
          placeholder="e.g. 28"
          value={data.age ?? ""}
          onChange={(e) => updateField("age", e.target.value ? Number(e.target.value) : null)}
        />
      </div>
      <div className="space-y-2">
        <Label>Height (cm)</Label>
        <Input
          type="number"
          placeholder="e.g. 178"
          value={data.height_cm ?? ""}
          onChange={(e) => updateField("height_cm", e.target.value ? Number(e.target.value) : null)}
        />
      </div>
    </div>

    <div className="space-y-2">
      <Label>Current Weight (kg)</Label>
      <Input
        type="number"
        placeholder="e.g. 82"
        value={data.current_weight_kg ?? ""}
        onChange={(e) => updateField("current_weight_kg", e.target.value ? Number(e.target.value) : null)}
      />
    </div>

    <div className="space-y-3">
      <Label>Estimated Body Fat %</Label>
      <div className="flex items-center gap-4">
        <Slider
          value={[data.estimated_body_fat_pct ?? 20]}
          onValueChange={([v]) => updateField("estimated_body_fat_pct", v)}
          min={5}
          max={50}
          step={1}
          className="flex-1"
        />
        <span className="min-w-[3rem] text-right text-sm font-medium text-foreground">
          {data.estimated_body_fat_pct ?? 20}%
        </span>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
        <span>Very Lean (5%)</span>
        <span>Average (20%)</span>
        <span>Higher (50%)</span>
      </div>
    </div>

    <div className="space-y-3">
      <Label>Activity Level</Label>
      <div className="grid gap-2">
        {activityLevels.map(({ value, label, desc }) => (
          <button
            key={value}
            onClick={() => updateField("activity_level", value)}
            className={cn(
              "rounded-lg border p-3 text-left transition-all",
              data.activity_level === value
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-card hover:border-muted-foreground/30"
            )}
          >
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default OnboardingMetrics;
