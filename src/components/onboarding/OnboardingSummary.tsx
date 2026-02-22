import type { OnboardingData } from "@/pages/Onboarding";
import { ShieldCheck, Check } from "lucide-react";

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

const OnboardingSummary = ({ data }: Props) => {
  const heightDisplay = data.height_feet != null && data.height_inches != null
    ? `${data.height_feet} ft ${data.height_inches} in (${data.height_cm} cm)`
    : "—";

  const weightDisplay = data.weight_lb != null
    ? `${data.weight_lb} lb (${data.current_weight_kg} kg)`
    : "—";

  const bodyFatDisplay = data.estimated_body_fat_pct != null
    ? `~${data.estimated_body_fat_pct}%`
    : "—";

  const sections = [
    { title: "Profile", items: [
      { label: "Goal", value: goalLabels[data.primary_goal] || data.primary_goal || "—" },
      { label: "Gender", value: data.gender ? data.gender.charAt(0).toUpperCase() + data.gender.slice(1) : "—" },
      { label: "Age", value: data.age ? `${data.age} years` : "—" },
      { label: "Height", value: heightDisplay },
      { label: "Weight", value: weightDisplay },
      { label: "Body Fat", value: bodyFatDisplay },
      { label: "Activity", value: activityLabels[data.activity_level] || "—" },
    ]},
    { title: "Training", items: [
      { label: "Location", value: data.training_location === "home" ? "Home" : data.training_location === "gym" ? `Gym — ${data.gym_name_address || ""}` : "—" },
      ...(data.training_location === "home" ? [{ label: "Equipment", value: data.home_equipment_list || "—" }] : []),
      { label: "Current Frequency", value: data.workout_days_current || "—" },
      { label: "Realistic Frequency", value: data.workout_days_realistic === "Other" ? data.workout_days_realistic_other || "—" : data.workout_days_realistic || "—" },
      { label: "Available Days", value: (data.available_days || []).join(", ") || "—" },
      ...(data.injuries ? [{ label: "Injuries", value: data.injuries }] : []),
      ...(data.surgeries ? [{ label: "Surgeries", value: data.surgeries }] : []),
    ]},
    { title: "Schedule", items: [
      { label: "Wake Time", value: data.wake_time || "—" },
      { label: "Workout Time", value: data.workout_time || "—" },
      { label: "Sleep Time", value: data.sleep_time || "—" },
      { label: "Occupation", value: data.occupation || "—" },
    ]},
    { title: "Nutrition", items: [
      { label: "Foods You Love", value: data.foods_love || "—" },
      { label: "Foods to Avoid", value: data.foods_dislike || "—" },
      { label: "Tracked Macros", value: data.tracked_macros_before === null ? "—" : data.tracked_macros_before ? "Yes" : "No" },
      ...(data.food_intolerances.length > 0 && data.food_intolerances[0] !== "None" ? [{
        label: "Intolerances",
        value: [...data.food_intolerances.filter(i => i !== "Other"), data.custom_allergy_text ? `Other: ${data.custom_allergy_text}` : ""].filter(Boolean).join(", "),
      }] : []),
    ]},
    { title: "Motivation", items: [
      { label: "What Drives You", value: data.motivation_text || "—" },
      { label: "Proud Of", value: data.favorite_body_part || "—" },
      { label: "Focus Area", value: data.work_on_most || "—" },
      { label: "Final Notes", value: data.final_notes || "—" },
    ]},
    { title: "Status", items: [
      { label: "Health Sync", value: data.health_sync_status === "connected" ? "Connected" : "Skipped" },
      { label: "Waiver", value: data.waiver_signed ? "✓ Signed" : "Not signed" },
    ]},
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">Your Profile Is Ready</h2>
        <p className="mt-1 text-sm text-muted-foreground">Review your info below, then confirm to get started.</p>
      </div>

      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <h3 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
            <Check className="h-3 w-3" />
            {section.title}
          </h3>
          <div className="space-y-1.5">
            {section.items.map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start rounded-lg border border-border bg-card px-4 py-2.5">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">{label}</span>
                <span className="text-xs text-foreground text-right max-w-[60%] leading-relaxed">{value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default OnboardingSummary;
