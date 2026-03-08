import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Drawer, DrawerContent, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Activity, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const MEASUREMENT_FIELDS = [
  { key: "neck", label: "Neck" },
  { key: "chest", label: "Chest" },
  { key: "left_arm", label: "L Bicep" },
  { key: "right_arm", label: "R Bicep" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "left_thigh", label: "L Thigh" },
  { key: "right_thigh", label: "R Thigh" },
  { key: "left_calf", label: "L Calf" },
  { key: "right_calf", label: "R Calf" },
] as const;

interface BodyStatsPopupProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  onCompleted: () => void;
}

const BodyStatsPopup = ({ open, onClose, eventId, onCompleted }: BodyStatsPopupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bodyWeight, setBodyWeight] = useState("");
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    if (!bodyWeight && Object.values(measurements).every(v => !v)) {
      toast({ title: "Enter at least body weight or one measurement", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      // Save weight
      if (bodyWeight) {
        const { error } = await supabase.from("weight_logs").insert({
          client_id: user.id,
          weight: parseFloat(bodyWeight),
          logged_at: today,
          source: "body_stats_popup",
        });
        if (error) throw error;
      }

      // Save measurements (non-empty only)
      const filled = Object.entries(measurements).filter(([_, v]) => v && parseFloat(v) > 0);
      if (filled.length > 0) {
        const measurementData: Record<string, any> = {
          client_id: user.id,
          measured_at: today,
        };
        filled.forEach(([key, val]) => {
          measurementData[key] = parseFloat(val);
        });
        const { error } = await supabase.from("body_measurements").insert(measurementData);
        if (error) throw error;
      }

      // Mark calendar event complete
      await supabase.from("calendar_events").update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      }).eq("id", eventId);

      toast({ title: "Body stats saved! 📊" });
      setTimeout(() => {
        onCompleted();
        onClose();
      }, 400);
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-bold text-foreground">Track Body Stats</h2>
          <div className="w-5" />
        </div>

        <div className="overflow-y-auto px-4 pb-4 space-y-5">
          {/* Icon + label */}
          <div className="flex flex-col items-center gap-2 py-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">Body Stats</p>
              <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, MMM d")}</p>
            </div>
          </div>

          {/* Body Weight */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Body Weight</label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="decimal"
                value={bodyWeight}
                onChange={(e) => setBodyWeight(e.target.value)}
                placeholder="0.0"
                className="text-center text-lg font-bold h-12 flex-1"
                autoFocus
              />
              <span className="text-sm text-muted-foreground font-medium">lbs</span>
            </div>
          </div>

          {/* Measurements toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Body Measurements</p>
              <p className="text-[10px] text-muted-foreground">Optional — track inches</p>
            </div>
            <Switch checked={showMeasurements} onCheckedChange={setShowMeasurements} />
          </div>

          {/* Measurement fields */}
          {showMeasurements && (
            <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
              {MEASUREMENT_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground min-w-[80px]">{label}</span>
                  <div className="flex items-center gap-2 flex-1 max-w-[160px]">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={measurements[key] || ""}
                      onChange={(e) => setMeasurements(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder="—"
                      className="text-center text-sm h-9"
                    />
                    <span className="text-xs text-muted-foreground">in</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DrawerFooter className="pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            size="lg"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default BodyStatsPopup;
