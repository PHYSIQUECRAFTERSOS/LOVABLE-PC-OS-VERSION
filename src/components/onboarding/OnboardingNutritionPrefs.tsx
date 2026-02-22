import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { UtensilsCrossed } from "lucide-react";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  validationErrors: Record<string, string>;
}

const OnboardingNutritionPrefs = ({ data, updateField, validationErrors }: Props) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Nutrition Preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your food preferences directly shape your meal plan.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground" />
          What particular healthy foods do you love? <span className="text-destructive">*</span>
        </Label>
        <Textarea
          placeholder="e.g. Chicken breast, rice, sweet potatoes, broccoli, salmon, eggs, oatmeal..."
          value={data.foods_love || ""}
          onChange={(e) => updateField("foods_love", e.target.value)}
          rows={3}
          className={cn(validationErrors.foods_love && "border-destructive")}
        />
        {validationErrors.foods_love && (
          <p className="text-xs text-destructive">{validationErrors.foods_love}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground" />
          What particular healthy foods do you not like? <span className="text-destructive">*</span>
        </Label>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-2">
          <p className="text-xs text-primary font-medium">We will avoid these in your meal plan.</p>
        </div>
        <Textarea
          placeholder="e.g. Fish, mushrooms, avocado, quinoa..."
          value={data.foods_dislike || ""}
          onChange={(e) => updateField("foods_dislike", e.target.value)}
          rows={3}
          className={cn(validationErrors.foods_dislike && "border-destructive")}
        />
        {validationErrors.foods_dislike && (
          <p className="text-xs text-destructive">{validationErrors.foods_dislike}</p>
        )}
      </div>
    </div>
  );
};

export default OnboardingNutritionPrefs;
