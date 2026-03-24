import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Drawer, DrawerContent, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Activity, Scale, X } from "lucide-react";
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

  const filledCount = (bodyWeight ? 1 : 0) + Object.values(measurements).filter(v => v && parseFloat(v) > 0).length;

  const handleSave = async () => {
    if (!user) return;
    if (!bodyWeight && Object.values(measurements).every(v => !v)) {
      toast({ title: "Enter at least body weight or one measurement", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      if (bodyWeight) {
        const { error } = await supabase.from("weight_logs").insert({
          client_id: user.id,
          weight: parseFloat(bodyWeight),
          logged_at: today,
          source: "body_stats_popup",
        });
        if (error) throw error;
      }

      const filled = Object.entries(measurements).filter(([_, v]) => v && parseFloat(v) > 0);
      if (filled.length > 0) {
        const measurementInsert: any = {
          client_id: user.id,
          measured_at: today,
        };
        filled.forEach(([key, val]) => {
          measurementInsert[key] = parseFloat(val);
        });
        const { error } = await supabase.from("body_measurements").insert(measurementInsert as any);
        if (error) throw error;
      }

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
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-bold text-foreground">Track Body Stats</h2>
          <div className="w-5" />
        </div>

        <div className="overflow-y-auto px-4 pb-4 space-y-5">
          {/* Hero section with gradient background */}
          <div className="relative rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 p-5">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/25 border border-primary/40 flex items-center justify-center shrink-0">
                <Scale className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">Body Stats</p>
                <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(), "EEEE, MMM d")}</p>
                <p className="text-[10px] text-primary font-medium mt-1">
                  {filledCount > 0 ? `${filledCount} field${filledCount > 1 ? "s" : ""} filled` : "Track your progress"}
                </p>
              </div>
            </div>
          </div>

          {/* Body Weight — prominent card */}
          <div className="rounded-xl bg-card border border-border p-4">
            <label className="text-sm font-semibold text-foreground mb-3 block">Body Weight</label>
            <div className="flex items-center justify-center gap-3">
              <Input
                type="text"
                inputMode="decimal"
                value={bodyWeight}
                onChange={(e) => setBodyWeight(e.target.value)}
                placeholder="0.0"
                className="text-center text-2xl font-bold h-14 max-w-[160px] bg-secondary/50 border-primary/20 focus:border-primary"
                autoFocus
              />
              <span className="text-sm text-muted-foreground font-semibold">lbs</span>
            </div>
          </div>

          {/* Measurements toggle */}
          <div className="flex items-center justify-between py-2 px-1">
            <div>
              <p className="text-sm font-semibold text-foreground">Body Measurements</p>
              <p className="text-[10px] text-muted-foreground">Optional — track inches</p>
            </div>
            <Switch checked={showMeasurements} onCheckedChange={setShowMeasurements} />
          </div>

          {/* Measurement fields — 2 column grid */}
          {showMeasurements && (
            <div className="rounded-xl bg-card border border-border p-4 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-2 gap-3">
                {MEASUREMENT_FIELDS.map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={measurements[key] || ""}
                        onChange={(e) => setMeasurements(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="—"
                        className="text-center text-sm h-9 bg-secondary/50"
                      />
                      <span className="text-[10px] text-muted-foreground shrink-0">in</span>
                    </div>
                  </div>
                ))}
              </div>
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
