import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCache } from "@/hooks/useDataFetch";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { X, Save } from "lucide-react";

const MEASUREMENT_FIELDS = [
  { key: "neck_in", label: "Neck" },
  { key: "shoulders_in", label: "Shoulders" },
  { key: "chest_in", label: "Chest" },
  { key: "bicep_in", label: "Bicep" },
  { key: "forearm_in", label: "Forearm" },
  { key: "waist_in", label: "Waist" },
  { key: "hips_in", label: "Hips" },
  { key: "thigh_in", label: "Thigh" },
  { key: "calf_in", label: "Calf" },
] as const;

const BodyStats = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId");

  const [bodyWeight, setBodyWeight] = useState("");
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [measurementsEnabled, setMeasurementsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [weightError, setWeightError] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Check if measurements are enabled for this client
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("measurements_enabled")
        .eq("user_id", user.id)
        .single();
      setMeasurementsEnabled(data?.measurements_enabled ?? false);
      setLoadingProfile(false);
    };
    load();
  }, [user]);

  const hasAnyInput = bodyWeight || Object.values(measurements).some(v => v);

  const handleCancel = () => {
    if (hasAnyInput) {
      if (!window.confirm("Discard changes?")) return;
    }
    navigate("/dashboard");
  };

  const handleSave = async () => {
    if (!user) return;
    if (!bodyWeight || isNaN(parseFloat(bodyWeight))) {
      setWeightError("Please enter your body weight.");
      return;
    }
    setWeightError("");
    setSaving(true);

    try {
      const logDate = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

      const record: Record<string, any> = {
        client_id: user.id,
        log_date: logDate,
        body_weight_lbs: parseFloat(bodyWeight),
      };

      // Add measurement values if any
      MEASUREMENT_FIELDS.forEach(({ key }) => {
        const val = measurements[key];
        if (val && !isNaN(parseFloat(val))) {
          record[key] = parseFloat(val);
        }
      });

      // Upsert by client_id + log_date
      const { error } = await supabase
        .from("body_stats")
        .upsert(record as any, { onConflict: "client_id,log_date" })
        .select();

      if (error) throw error;

      // Also save to weight_logs for compatibility with existing weight tracking
      await supabase.from("weight_logs").upsert(
        {
          client_id: user.id,
          weight: parseFloat(bodyWeight),
          logged_at: logDate,
          source: "body_stats_page",
        },
        { onConflict: "client_id,logged_at" }
      ).select();

      window.dispatchEvent(new Event("weight-logged"));
      if (eventId) {
        await supabase.from("calendar_events").update({
          is_completed: true,
          completed_at: new Date().toISOString(),
        }).eq("id", eventId);
      }

      // Invalidate dashboard cache so the task shows as completed immediately
      invalidateCache(`today-actions-${user.id}-${logDate}`);

      toast({ title: "Body stats saved! 📊" });
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button
          onClick={handleCancel}
          className="text-sm font-medium text-muted-foreground hover:text-foreground min-w-[60px]"
        >
          Cancel
        </button>
        <h1 className="text-base font-bold text-foreground">Today</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 min-w-[60px] justify-end disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* Body Weight — always visible */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-foreground">Body Weight</label>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="text"
              inputMode="decimal"
              value={bodyWeight}
              onChange={(e) => {
                setBodyWeight(e.target.value);
                if (weightError) setWeightError("");
              }}
              onFocus={(e) => e.target.select()}
              placeholder="0.0"
              className="text-right text-lg font-bold h-12 flex-1 bg-secondary/30 border-border"
              autoFocus
            />
            <span className="text-sm text-muted-foreground font-medium w-8">lbs</span>
          </div>
          {weightError && (
            <p className="text-xs text-destructive">{weightError}</p>
          )}
        </div>

        {/* Measurements Section — coach-controlled */}
        {!loadingProfile && measurementsEnabled && (
          <>
            <Separator className="bg-border/50" />
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Measurements</p>
              <div className="space-y-1">
                {MEASUREMENT_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-sm text-foreground min-w-[90px]">{label}</span>
                    <div className="flex items-center gap-2 flex-1 max-w-[160px]">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={measurements[key] || ""}
                        onChange={(e) =>
                          setMeasurements((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        onFocus={(e) => e.target.select()}
                        placeholder="—"
                        className="text-right text-sm h-9 bg-secondary/30 border-border"
                      />
                      <span className="text-xs text-muted-foreground w-4">in</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BodyStats;
