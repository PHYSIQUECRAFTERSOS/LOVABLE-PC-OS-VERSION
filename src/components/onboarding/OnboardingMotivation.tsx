import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Flame, Heart, Target } from "lucide-react";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  validationErrors: Record<string, string>;
}

const OnboardingMotivation = ({ data, updateField, validationErrors }: Props) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Motivation & Goals</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Help your coach understand what drives you so they can keep you on track.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-muted-foreground" />
          What do we need to know to keep you motivated? What drives you? <span className="text-destructive">*</span>
        </Label>
        <Textarea
          placeholder="e.g. I want to feel confident in my own skin. I'm tired of starting and stopping. I need accountability and structure..."
          value={data.motivation_text || ""}
          onChange={(e) => updateField("motivation_text", e.target.value)}
          rows={4}
          className={cn(validationErrors.motivation_text && "border-destructive")}
        />
        {validationErrors.motivation_text && (
          <p className="text-xs text-destructive">{validationErrors.motivation_text}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Heart className="h-3.5 w-3.5 text-muted-foreground" />
          What is your favorite body part you are proud of? <span className="text-destructive">*</span>
        </Label>
        <Textarea
          placeholder="e.g. My shoulders, my legs, my back..."
          value={data.favorite_body_part || ""}
          onChange={(e) => updateField("favorite_body_part", e.target.value)}
          rows={2}
          className={cn(validationErrors.favorite_body_part && "border-destructive")}
        />
        {validationErrors.favorite_body_part && (
          <p className="text-xs text-destructive">{validationErrors.favorite_body_part}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          What do you want to work on the most? <span className="text-destructive">*</span>
        </Label>
        <Textarea
          placeholder="e.g. My midsection — I want visible abs. Also want to grow my glutes and improve posture..."
          value={data.work_on_most || ""}
          onChange={(e) => updateField("work_on_most", e.target.value)}
          rows={2}
          className={cn(validationErrors.work_on_most && "border-destructive")}
        />
        {validationErrors.work_on_most && (
          <p className="text-xs text-destructive">{validationErrors.work_on_most}</p>
        )}
      </div>
    </div>
  );
};

export default OnboardingMotivation;
