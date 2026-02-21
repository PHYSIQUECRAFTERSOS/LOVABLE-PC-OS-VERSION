import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
}

const OnboardingTraining = ({ data, updateField }: Props) => (
  <div className="space-y-6">
    <div>
      <h2 className="font-display text-2xl font-bold text-foreground">Training Background</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Optional — share any injuries or surgeries so your coach can program safely. You can skip this step.
      </p>
    </div>

    <div className="space-y-2">
      <Label>Current or past injuries</Label>
      <Textarea
        placeholder="e.g. Rotator cuff tear (2022), chronic lower back pain..."
        value={data.injuries}
        onChange={(e) => updateField("injuries", e.target.value)}
        rows={3}
      />
    </div>

    <div className="space-y-2">
      <Label>Surgeries</Label>
      <Textarea
        placeholder="e.g. ACL reconstruction (left knee, 2020)..."
        value={data.surgeries}
        onChange={(e) => updateField("surgeries", e.target.value)}
        rows={3}
      />
    </div>
  </div>
);

export default OnboardingTraining;
