import type { OnboardingData } from "@/pages/Onboarding";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const OnboardingMetrics = ({ data, updateField }: Props) => {
  const handleHeightChange = (feet: number | null, inches: number | null) => {
    const ft = feet ?? data.height_feet;
    const inc = inches ?? data.height_inches;
    if (feet !== null) updateField("height_feet", feet);
    if (inches !== null) updateField("height_inches", inches);
    if (ft != null && inc != null) {
      updateField("height_cm", Math.round(ft * 30.48 + inc * 2.54));
    }
  };

  const handleWeightChange = (lbs: number | null) => {
    updateField("weight_lb", lbs);
    if (lbs != null) {
      updateField("current_weight_kg", Math.round(lbs * 0.453592 * 10) / 10);
    } else {
      updateField("current_weight_kg", null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Body Metrics</h2>
        <p className="mt-1 text-sm text-muted-foreground">We use this to calculate your baseline targets.</p>
      </div>

      {/* Gender */}
      <div className="space-y-3">
        <Label>Gender</Label>
        <div className="grid grid-cols-2 gap-3">
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              onClick={() => updateField("gender", g)}
              className={cn(
                "rounded-lg border p-3 text-sm font-medium transition-all capitalize",
                data.gender === g
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
              )}
            >
              {g === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
      </div>

      {/* Age */}
      <div className="space-y-2">
        <Label>Age</Label>
        <Input
          type="number"
          placeholder="e.g. 28"
          value={data.age ?? ""}
          onChange={(e) => updateField("age", e.target.value ? Number(e.target.value) : null)}
        />
      </div>

      {/* Height - Feet & Inches */}
      <div className="space-y-2">
        <Label>Height</Label>
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={data.height_feet != null ? String(data.height_feet) : ""}
            onValueChange={(v) => handleHeightChange(Number(v), null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Feet" />
            </SelectTrigger>
            <SelectContent>
              {[4, 5, 6, 7].map((ft) => (
                <SelectItem key={ft} value={String(ft)}>
                  {ft} ft
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={data.height_inches != null ? String(data.height_inches) : ""}
            onValueChange={(v) => handleHeightChange(null, Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Inches" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i} value={String(i)}>
                  {i} in
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data.height_feet != null && data.height_inches != null && (
          <p className="text-xs text-muted-foreground">
            {data.height_feet} ft {data.height_inches} in ({data.height_cm} cm)
          </p>
        )}
      </div>

      {/* Weight - Pounds */}
      <div className="space-y-2">
        <Label>Current Weight (lbs)</Label>
        <Input
          type="number"
          placeholder="e.g. 185"
          value={data.weight_lb ?? ""}
          onChange={(e) => handleWeightChange(e.target.value ? Number(e.target.value) : null)}
        />
        {data.weight_lb != null && (
          <p className="text-xs text-muted-foreground">
            ≈ {data.current_weight_kg} kg
          </p>
        )}
      </div>

      {/* Activity Level */}
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
};

export default OnboardingMetrics;
