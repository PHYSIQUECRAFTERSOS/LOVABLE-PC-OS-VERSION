import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
}

const digestiveOptions = ["Bloating", "Constipation", "Loose stools", "Acid reflux", "None"];

const OnboardingNutrition = ({ data, updateField }: Props) => {
  const toggleDigestive = (item: string) => {
    if (item === "None") {
      updateField("digestive_issues", ["None"]);
      return;
    }
    const current = data.digestive_issues.filter(i => i !== "None");
    updateField(
      "digestive_issues",
      current.includes(item) ? current.filter(i => i !== item) : [...current, item]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Nutrition History</h2>
        <p className="mt-1 text-sm text-muted-foreground">Understanding your background helps us dial in your plan.</p>
      </div>

      <div className="space-y-3">
        <Label>Have you tracked macros before?</Label>
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map(val => (
            <button
              key={String(val)}
              onClick={() => updateField("tracked_macros_before", val)}
              className={cn(
                "rounded-lg border p-3 text-sm font-medium transition-all",
                data.tracked_macros_before === val
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
              )}
            >
              {val ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Food intolerances / allergies</Label>
        <div className="flex flex-wrap gap-2">
          {["Dairy", "Gluten", "Soy", "Nuts", "Eggs", "Shellfish", "None"].map(item => (
            <button
              key={item}
              onClick={() => {
                if (item === "None") { updateField("food_intolerances", ["None"]); return; }
                const current = data.food_intolerances.filter(i => i !== "None");
                updateField("food_intolerances", current.includes(item) ? current.filter(i => i !== item) : [...current, item]);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                data.food_intolerances.includes(item)
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Digestive issues?</Label>
        <div className="flex flex-wrap gap-2">
          {digestiveOptions.map(item => (
            <button
              key={item}
              onClick={() => toggleDigestive(item)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                data.digestive_issues.includes(item)
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OnboardingNutrition;
