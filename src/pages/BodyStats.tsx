import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCache } from "@/hooks/useDataFetch";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Save } from "lucide-react";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";

// Measurement fields (stored in inches/cm via parseMeasurementInput → DB column)
const MEASUREMENT_FIELDS: { key: string; label: string }[] = [
  { key: "neck", label: "Neck" },
  { key: "shoulders", label: "Shoulders" },
  { key: "chest", label: "Chest" },
  { key: "left_arm", label: "Left Arm" },
  { key: "right_arm", label: "Right Arm" },
  { key: "forearm", label: "Forearm" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "left_thigh", label: "Left Thigh" },
  { key: "right_thigh", label: "Right Thigh" },
  { key: "left_calf", label: "Left Calf" },
  { key: "right_calf", label: "Right Calf" },
];

const HEALTH_FIELDS: { key: string; label: string; unit?: string; isInt?: boolean }[] = [
  { key: "body_fat_pct", label: "Body Fat", unit: "%" },
  { key: "blood_pressure_systolic", label: "BP Systolic", unit: "mmHg", isInt: true },
  { key: "blood_pressure_diastolic", label: "BP Diastolic", unit: "mmHg", isInt: true },
];

const BodyStats = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { weightLabel, measurementLabel, parseWeightInput, parseMeasurementInput } = useUnitPreferences();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId");

  const [bodyWeight, setBodyWeight] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [measurementsEnabled, setMeasurementsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [weightError, setWeightError] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("measurements_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) console.error("[BodyStats] profile load error:", error);
      setMeasurementsEnabled(data?.measurements_enabled === true);
      setLoadingProfile(false);
    };
    load();
  }, [user]);

  const hasAnyInput = bodyWeight || Object.values(values).some((v) => v);

  const handleCancel = () => {
    if (hasAnyInput && !window.confirm("Discard changes?")) return;
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
      const weightLbs = parseWeightInput(parseFloat(bodyWeight));

      // Save weight to weight_logs (always)
      const { error: wErr } = await supabase
        .from("weight_logs")
        .upsert(
          {
            client_id: user.id,
            weight: Number(weightLbs.toFixed(1)),
            logged_at: logDate,
            source: "body_stats_page",
          },
          { onConflict: "client_id,logged_at" }
        )
        .select();
      if (wErr) throw wErr;

      // Save measurements + health stats (only if enabled and any value provided)
      const hasMeasurements =
        measurementsEnabled &&
        [...MEASUREMENT_FIELDS, ...HEALTH_FIELDS].some(({ key }) => {
          const v = values[key];
          return v && !isNaN(parseFloat(v));
        });

      if (hasMeasurements) {
        const record: Record<string, any> = { client_id: user.id };
        MEASUREMENT_FIELDS.forEach(({ key }) => {
          const v = values[key];
          if (v && !isNaN(parseFloat(v))) {
            record[key] = parseMeasurementInput(parseFloat(v));
          }
        });
        HEALTH_FIELDS.forEach(({ key, isInt }) => {
          const v = values[key];
          if (v && !isNaN(parseFloat(v))) {
            record[key] = isInt ? parseInt(v) : parseFloat(v);
          }
        });
        const { error: mErr } = await supabase
          .from("body_measurements")
          .insert(record as any)
          .select();
        if (mErr) throw mErr;
      }

      window.dispatchEvent(new Event("weight-logged"));
      window.dispatchEvent(new Event("measurements-logged"));

      if (eventId) {
        await supabase
          .from("calendar_events")
          .update({ is_completed: true, completed_at: new Date().toISOString() })
          .eq("id", eventId);
      }

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
      <div className="flex items-center justify-center px-4 py-3 safe-top border-b border-border">
        <h1 className="text-base font-bold text-foreground">Today</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* Body Weight */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Body Weight</label>
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
            <span className="text-sm text-muted-foreground font-medium w-8">{weightLabel}</span>
          </div>
          {weightError && <p className="text-xs text-destructive">{weightError}</p>}
        </div>

        {/* Cancel / Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 h-11 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Measurements + Health (coach-controlled) */}
        {!loadingProfile && measurementsEnabled && (
          <>
            <Separator className="bg-border/50" />
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Measurements</p>
              <div className="space-y-1">
                {MEASUREMENT_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-sm text-foreground min-w-[100px]">{label}</span>
                    <div className="flex items-center gap-2 flex-1 max-w-[160px]">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={values[key] || ""}
                        onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                        placeholder="—"
                        className="text-right text-sm h-9 bg-secondary/30 border-border"
                      />
                      <span className="text-xs text-muted-foreground w-6">{measurementLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-border/50" />
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Health Stats</p>
              <div className="space-y-1">
                {HEALTH_FIELDS.map(({ key, label, unit }) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-sm text-foreground min-w-[100px]">{label}</span>
                    <div className="flex items-center gap-2 flex-1 max-w-[160px]">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={values[key] || ""}
                        onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                        placeholder="—"
                        className="text-right text-sm h-9 bg-secondary/30 border-border"
                      />
                      <span className="text-xs text-muted-foreground w-10">{unit}</span>
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
