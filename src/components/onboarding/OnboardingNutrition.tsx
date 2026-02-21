import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
}

const allergyOptions = ["Dairy", "Gluten", "Soy", "Nuts", "Eggs", "Shellfish", "Other", "None"];
const digestiveOptions = ["Bloating", "Constipation", "Loose stools", "Acid reflux", "Other", "None"];

const OnboardingNutrition = ({ data, updateField }: Props) => {
  const toggleAllergy = (item: string) => {
    if (item === "None") {
      updateField("food_intolerances", ["None"]);
      updateField("custom_allergy_text", "");
      return;
    }
    const current = data.food_intolerances.filter((i) => i !== "None");
    if (current.includes(item)) {
      const next = current.filter((i) => i !== item);
      updateField("food_intolerances", next);
      if (item === "Other") updateField("custom_allergy_text", "");
    } else {
      updateField("food_intolerances", [...current, item]);
    }
  };

  const toggleDigestive = (item: string) => {
    if (item === "None") {
      updateField("digestive_issues", ["None"]);
      updateField("custom_digestive_text", "");
      return;
    }
    const current = data.digestive_issues.filter((i) => i !== "None");
    if (current.includes(item)) {
      const next = current.filter((i) => i !== item);
      updateField("digestive_issues", next);
      if (item === "Other") updateField("custom_digestive_text", "");
    } else {
      updateField("digestive_issues", [...current, item]);
    }
  };

  const noneAllergy = data.food_intolerances.includes("None");
  const noneDigestive = data.digestive_issues.includes("None");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Nutrition History</h2>
        <p className="mt-1 text-sm text-muted-foreground">Understanding your background helps us dial in your plan.</p>
      </div>

      {/* Tracked macros */}
      <div className="space-y-3">
        <Label>Have you tracked macros before?</Label>
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((val) => (
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

      {/* Food allergies */}
      <div className="space-y-3">
        <Label>Food intolerances / allergies</Label>
        <div className="flex flex-wrap gap-2">
          {allergyOptions.map((item) => (
            <button
              key={item}
              onClick={() => toggleAllergy(item)}
              disabled={noneAllergy && item !== "None"}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                data.food_intolerances.includes(item)
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30",
                noneAllergy && item !== "None" && "opacity-40 cursor-not-allowed"
              )}
            >
              {item}
            </button>
          ))}
        </div>
        {data.food_intolerances.includes("Other") && (
          <Input
            placeholder="Please specify allergy"
            value={data.custom_allergy_text}
            onChange={(e) => updateField("custom_allergy_text", e.target.value)}
            className="mt-2"
          />
        )}
      </div>

      {/* Digestive issues */}
      <div className="space-y-3">
        <Label>Digestive issues?</Label>
        <div className="flex flex-wrap gap-2">
          {digestiveOptions.map((item) => (
            <button
              key={item}
              onClick={() => toggleDigestive(item)}
              disabled={noneDigestive && item !== "None"}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                data.digestive_issues.includes(item)
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30",
                noneDigestive && item !== "None" && "opacity-40 cursor-not-allowed"
              )}
            >
              {item}
            </button>
          ))}
        </div>
        {data.digestive_issues.includes("Other") && (
          <Input
            placeholder="Describe digestive issue"
            value={data.custom_digestive_text}
            onChange={(e) => updateField("custom_digestive_text", e.target.value)}
            className="mt-2"
          />
        )}
      </div>
    </div>
  );
};

export default OnboardingNutrition;
