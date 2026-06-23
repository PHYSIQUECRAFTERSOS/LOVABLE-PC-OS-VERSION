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
  validationErrors?: Record<string, string>;
}


const activityLevels = [
  { value: "sedentary", label: "Sedentary", desc: "Desk job, little exercise" },
  { value: "lightly_active", label: "Lightly Active", desc: "1-2 workouts/week" },
  { value: "moderately_active", label: "Moderately Active", desc: "3-5 workouts/week" },
  { value: "very_active", label: "Very Active", desc: "6-7 workouts/week + active job" },
];

const OnboardingMetrics = ({ data, updateField, validationErrors = {} }: Props) => {
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

  // DOB parts derived from stored YYYY-MM-DD
  const dobParts = (() => {
    if (!data.date_of_birth) return { y: "", m: "", d: "" };
    const [y, m, d] = data.date_of_birth.split("-");
    return { y: y || "", m: m || "", d: d || "" };
  })();

  const updateDob = (year: string, month: string, day: string) => {
    if (!year || !month || !day) {
      updateField("date_of_birth", null);
      return;
    }
    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");
    const iso = `${year}-${mm}-${dd}`;
    // Validate (real calendar date)
    const dt = new Date(`${iso}T00:00:00`);
    if (isNaN(dt.getTime()) || dt.getUTCMonth() + 1 !== Number(mm) || dt.getUTCDate() !== Number(dd)) {
      updateField("date_of_birth", null);
      return;
    }
    updateField("date_of_birth", iso);
    // Auto-fill age if not already set or appears stale
    const today = new Date();
    let age = today.getFullYear() - Number(year);
    const mDiff = today.getMonth() + 1 - Number(mm);
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < Number(dd))) age--;
    if (age > 0 && age < 120) updateField("age", age);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 90 }, (_, i) => currentYear - 13 - i); // 13+ down to 102
  const months = [
    { v: "1", l: "Jan" }, { v: "2", l: "Feb" }, { v: "3", l: "Mar" }, { v: "4", l: "Apr" },
    { v: "5", l: "May" }, { v: "6", l: "Jun" }, { v: "7", l: "Jul" }, { v: "8", l: "Aug" },
    { v: "9", l: "Sep" }, { v: "10", l: "Oct" }, { v: "11", l: "Nov" }, { v: "12", l: "Dec" },
  ];
  const daysInMonth = (() => {
    const y = Number(dobParts.y);
    const m = Number(dobParts.m);
    if (!y || !m) return 31;
    return new Date(y, m, 0).getDate();
  })();

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

      {/* Birthday */}
      <div className="space-y-2">
        <Label>Birthday</Label>
        <div className="grid grid-cols-3 gap-2">
          <Select
            value={dobParts.m}
            onValueChange={(v) => updateDob(dobParts.y, v, dobParts.d)}
          >
            <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              {months.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={dobParts.d}
            onValueChange={(v) => updateDob(dobParts.y, dobParts.m, v)}
          >
            <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <SelectItem key={d} value={String(d)}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={dobParts.y}
            onValueChange={(v) => updateDob(v, dobParts.m, dobParts.d)}
          >
            <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {validationErrors.date_of_birth && (
          <p className="text-xs text-destructive">{validationErrors.date_of_birth}</p>
        )}
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
        {data.weight_lb != null && data.weight_lb > 0 && (
          <p className="text-xs text-muted-foreground">
            {data.weight_lb} lbs
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
