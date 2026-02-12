import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ruler } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

const MeasurementsForm = ({ onSubmitted }: { onSubmitted?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    const entry = {
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
    };

    const { error } = await supabase.from("body_measurements").insert(entry);
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
      <CardContent className="space-y-4">
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
        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? "Saving..." : "Save Measurements"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MeasurementsForm;
