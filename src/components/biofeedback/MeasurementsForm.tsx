import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ruler } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";

const FIELDS = [
  { key: "neck", label: "Neck" },
  { key: "chest", label: "Chest" },
  { key: "left_arm", label: "Left Arm" },
  { key: "right_arm", label: "Right Arm" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "left_thigh", label: "Left Thigh" },
  { key: "right_thigh", label: "Right Thigh" },
  { key: "left_calf", label: "Left Calf" },
  { key: "right_calf", label: "Right Calf" },
] as const;

const HEALTH_FIELDS = [
  { key: "body_fat_pct", label: "Body Fat %", step: "0.1" },
  { key: "blood_pressure_systolic", label: "BP Systolic", step: "1" },
  { key: "blood_pressure_diastolic", label: "BP Diastolic", step: "1" },
  { key: "resting_hr", label: "Resting HR", step: "1" },
  { key: "sleep_hours", label: "Sleep (hours)", step: "0.5" },
  { key: "steps", label: "Steps", step: "1" },
] as const;

const MeasurementsForm = ({ onSubmitted }: { onSubmitted?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { measurementLabel, parseMeasurementInput } = useUnitPreferences();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    const entry: Record<string, any> = {
      client_id: user.id,
      neck: values.neck ? parseFloat(values.neck) : null,
      chest: values.chest ? parseFloat(values.chest) : null,
      left_arm: values.left_arm ? parseFloat(values.left_arm) : null,
      right_arm: values.right_arm ? parseFloat(values.right_arm) : null,
      waist: values.waist ? parseFloat(values.waist) : null,
      hips: values.hips ? parseFloat(values.hips) : null,
      left_thigh: values.left_thigh ? parseFloat(values.left_thigh) : null,
      right_thigh: values.right_thigh ? parseFloat(values.right_thigh) : null,
      left_calf: values.left_calf ? parseFloat(values.left_calf) : null,
      right_calf: values.right_calf ? parseFloat(values.right_calf) : null,
      body_fat_pct: values.body_fat_pct ? parseFloat(values.body_fat_pct) : null,
      blood_pressure_systolic: values.blood_pressure_systolic ? parseInt(values.blood_pressure_systolic) : null,
      blood_pressure_diastolic: values.blood_pressure_diastolic ? parseInt(values.blood_pressure_diastolic) : null,
      resting_hr: values.resting_hr ? parseInt(values.resting_hr) : null,
      sleep_hours: values.sleep_hours ? parseFloat(values.sleep_hours) : null,
      steps: values.steps ? parseInt(values.steps) : null,
    };

    const { error } = await supabase.from("body_measurements").insert(entry as any);
    setLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Measurements saved! 📏" });
      setValues({});
      onSubmitted?.();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5" /> Body Measurements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Body Measurements</p>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <Label className="text-xs">{label} (in/cm)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={values[key] || ""}
                  onChange={(e) => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Health Stats</p>
          <div className="grid grid-cols-2 gap-3">
            {HEALTH_FIELDS.map(({ key, label, step }) => (
              <div key={key}>
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  step={step}
                  value={values[key] || ""}
                  onChange={(e) => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? "Saving..." : "Save Measurements"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MeasurementsForm;
