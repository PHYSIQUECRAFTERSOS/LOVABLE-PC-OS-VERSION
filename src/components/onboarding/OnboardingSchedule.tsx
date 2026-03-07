import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Clock, Briefcase } from "lucide-react";
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
  validationErrors: Record<string, string>;
}

const generateTimeOptions = () => {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      const min = m === 0 ? "00" : "30";
      options.push(`${hour12}:${min} ${ampm}`);
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

const OnboardingSchedule = ({ data, updateField, validationErrors }: Props) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Schedule & Lifestyle</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Understanding your daily routine helps us optimize your program timing.
        </p>
      </div>

      {/* Time pickers */}
      <div className="space-y-4">
        {[
          { key: "wake_time" as const, label: "What time do you wake up?", icon: Clock },
          { key: "workout_time" as const, label: "What time do you workout?", icon: Clock },
          { key: "sleep_time" as const, label: "What time do you go to sleep?", icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <div key={key} className="space-y-2">
            <Label className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {label} <span className="text-destructive">*</span>
            </Label>
            <Select
              value={data[key] || ""}
              onValueChange={(v) => updateField(key, v)}
            >
              <SelectTrigger className={cn(validationErrors[key] && "border-destructive")}>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                {timeOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors[key] && (
              <p className="text-xs text-destructive">{validationErrors[key]}</p>
            )}
          </div>
        ))}
      </div>

      {/* Occupation */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
          What do you do for work? <span className="text-destructive">*</span>
        </Label>
        <Textarea
          placeholder="e.g. Software engineer, sit at a desk 8-10 hours a day..."
          value={data.occupation || ""}
          onChange={(e) => updateField("occupation", e.target.value)}
          rows={2}
          className={cn(validationErrors.occupation && "border-destructive")}
        />
        {validationErrors.occupation && (
          <p className="text-xs text-destructive">{validationErrors.occupation}</p>
        )}
      </div>
    </div>
  );
};

export default OnboardingSchedule;
