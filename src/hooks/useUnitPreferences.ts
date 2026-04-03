import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type WeightUnit = "lbs" | "kg";
export type MeasurementUnit = "in" | "cm";
export type DistanceUnit = "miles" | "km";

interface UnitPreferences {
  weightUnit: WeightUnit;
  measurementUnit: MeasurementUnit;
  distanceUnit: DistanceUnit;
  loading: boolean;

  // Display conversions (stored imperial → display unit)
  convertWeight: (lbs: number) => number;
  convertMeasurement: (inches: number) => number;
  convertDistance: (km: number) => number;

  // Input parsing (user input in their unit → imperial for storage)
  parseWeightInput: (val: number) => number;
  parseMeasurementInput: (val: number) => number;
  parseDistanceInput: (val: number) => number;

  // Labels
  weightLabel: string;
  measurementLabel: string;
  distanceLabel: string;

  // Setters (persist to DB)
  setWeightUnit: (u: WeightUnit) => Promise<void>;
  setMeasurementUnit: (u: MeasurementUnit) => Promise<void>;
  setDistanceUnit: (u: DistanceUnit) => Promise<void>;
}

const LBS_TO_KG = 0.453592;
const IN_TO_CM = 2.54;
const KM_TO_MILES = 0.621371;

export function useUnitPreferences(): UnitPreferences {
  const { user, role } = useAuth();
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>("lbs");
  const [measurementUnit, setMeasurementUnitState] = useState<MeasurementUnit>("in");
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>("miles");
  const [loading, setLoading] = useState(true);

  // Coach/admin always see imperial — skip DB fetch
  const isCoachOrAdmin = role === "coach" || role === "admin";

  useEffect(() => {
    if (!user || isCoachOrAdmin) {
      setLoading(false);
      return;
    }

    const fetchPrefs = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("preferred_weight_unit, preferred_measurement_unit, preferred_distance_unit")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setWeightUnitState((data.preferred_weight_unit as WeightUnit) || "lbs");
        setMeasurementUnitState((data.preferred_measurement_unit as MeasurementUnit) || "in");
        setDistanceUnitState((data.preferred_distance_unit as DistanceUnit) || "miles");
      }
      setLoading(false);
    };

    fetchPrefs();
  }, [user, isCoachOrAdmin]);

  const updateProfile = useCallback(
    async (field: string, value: string) => {
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ [field]: value } as any)
        .eq("user_id", user.id);
    },
    [user]
  );

  const setWeightUnit = useCallback(
    async (u: WeightUnit) => {
      setWeightUnitState(u);
      await updateProfile("preferred_weight_unit", u);
    },
    [updateProfile]
  );

  const setMeasurementUnit = useCallback(
    async (u: MeasurementUnit) => {
      setMeasurementUnitState(u);
      await updateProfile("preferred_measurement_unit", u);
    },
    [updateProfile]
  );

  const setDistanceUnit = useCallback(
    async (u: DistanceUnit) => {
      setDistanceUnitState(u);
      await updateProfile("preferred_distance_unit", u);
    },
    [updateProfile]
  );

  // For coach/admin, all conversions are identity (imperial)
  const effectiveWeight = isCoachOrAdmin ? "lbs" : weightUnit;
  const effectiveMeasurement = isCoachOrAdmin ? "in" : measurementUnit;
  const effectiveDistance = isCoachOrAdmin ? "km" : distanceUnit;

  const helpers = useMemo(() => ({
    convertWeight: (lbs: number) =>
      effectiveWeight === "kg" ? Number((lbs * LBS_TO_KG).toFixed(1)) : lbs,
    convertMeasurement: (inches: number) =>
      effectiveMeasurement === "cm" ? Number((inches * IN_TO_CM).toFixed(1)) : inches,
    convertDistance: (km: number) =>
      effectiveDistance === "miles" ? Number((km * KM_TO_MILES).toFixed(1)) : km,

    parseWeightInput: (val: number) =>
      effectiveWeight === "kg" ? Number((val / LBS_TO_KG).toFixed(1)) : val,
    parseMeasurementInput: (val: number) =>
      effectiveMeasurement === "cm" ? Number((val / IN_TO_CM).toFixed(1)) : val,
    parseDistanceInput: (val: number) =>
      effectiveDistance === "miles" ? Number((val / KM_TO_MILES).toFixed(1)) : val,

    weightLabel: effectiveWeight,
    measurementLabel: effectiveMeasurement,
    distanceLabel: effectiveDistance,
  }), [effectiveWeight, effectiveMeasurement, effectiveDistance]);

  return {
    weightUnit: effectiveWeight as WeightUnit,
    measurementUnit: effectiveMeasurement as MeasurementUnit,
    distanceUnit: effectiveDistance as DistanceUnit,
    loading,
    ...helpers,
    setWeightUnit,
    setMeasurementUnit,
    setDistanceUnit,
  };
}
