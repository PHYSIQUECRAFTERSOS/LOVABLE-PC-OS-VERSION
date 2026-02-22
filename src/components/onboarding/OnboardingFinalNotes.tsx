import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  validationErrors: Record<string, string>;
}

const OnboardingFinalNotes = ({ data, updateField, validationErrors }: Props) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Final Notes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Last chance to share anything your coach should know before we build your program.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          Is there anything else we need to know that we have not covered? <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground">You can write "N/A" if there's nothing else.</p>
        <Textarea
          placeholder='e.g. I travel frequently for work, I have a wedding in 3 months, etc. Or type "N/A" if nothing else.'
          value={data.final_notes || ""}
          onChange={(e) => updateField("final_notes", e.target.value)}
          rows={4}
          className={cn(validationErrors.final_notes && "border-destructive")}
        />
        {validationErrors.final_notes && (
          <p className="text-xs text-destructive">{validationErrors.final_notes}</p>
        )}
      </div>
    </div>
  );
};

export default OnboardingFinalNotes;
