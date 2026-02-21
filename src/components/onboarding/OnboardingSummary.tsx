import type { OnboardingData } from "@/pages/Onboarding";
import { ShieldCheck } from "lucide-react";

interface Props {
  data: OnboardingData;
}

const goalLabels: Record<string, string> = {
  lose_fat: "Lose Body Fat",
  build_muscle: "Build Muscle",
  recomposition: "Recomposition",
  improve_energy: "Improve Energy",
  hormone_optimization: "Hormone Optimization",
  other: "Other",
};

const activityLabels: Record<string, string> = {
  sedentary: "Sedentary",
  lightly_active: "Lightly Active",
  moderately_active: "Moderately Active",
  very_active: "Very Active",
};

const OnboardingSummary = ({ data }: Props) => (
  <div className="space-y-6">
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <ShieldCheck className="h-8 w-8 text-primary" />
      </div>
      <h2 className="font-display text-2xl font-bold text-foreground">Your Profile Is Ready</h2>
      <p className="mt-1 text-sm text-muted-foreground">Review your info below, then confirm to get started.</p>
    </div>

    <div className="space-y-3">
      <SummaryRow label="Goal" value={goalLabels[data.primary_goal] || data.primary_goal} />
      <SummaryRow label="Age" value={data.age ? `${data.age} years` : "—"} />
      <SummaryRow label="Height" value={data.height_cm ? `${data.height_cm} cm` : "—"} />
      <SummaryRow label="Weight" value={data.current_weight_kg ? `${data.current_weight_kg} kg` : "—"} />
      <SummaryRow label="Body Fat" value={data.estimated_body_fat_pct ? `~${data.estimated_body_fat_pct}%` : "—"} />
      <SummaryRow label="Activity" value={activityLabels[data.activity_level] || "—"} />
      <SummaryRow label="Tracked Macros" value={data.tracked_macros_before === null ? "—" : data.tracked_macros_before ? "Yes" : "No"} />
      {data.food_intolerances.length > 0 && data.food_intolerances[0] !== "None" && (
        <SummaryRow label="Intolerances" value={data.food_intolerances.join(", ")} />
      )}
      {data.digestive_issues.length > 0 && data.digestive_issues[0] !== "None" && (
        <SummaryRow label="Digestive" value={data.digestive_issues.join(", ")} />
      )}
      {data.injuries && <SummaryRow label="Injuries" value={data.injuries} />}
      {data.surgeries && <SummaryRow label="Surgeries" value={data.surgeries} />}
      <SummaryRow
        label="Health Sync"
        value={data.health_sync_status === "connected" ? "✓ Connected" : "Skipped"}
      />
    </div>
  </div>
);

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-start rounded-lg border border-border bg-card px-4 py-3">
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    <span className="text-sm text-foreground text-right max-w-[60%]">{value}</span>
  </div>
);

export default OnboardingSummary;
