import { useUnitPreferences, WeightUnit, MeasurementUnit, DistanceUnit } from "@/hooks/useUnitPreferences";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";

interface OptionRowProps {
  label: string;
  sublabel?: string;
  selected: boolean;
  onClick: () => void;
}

const OptionRow = ({ label, sublabel, selected, onClick }: OptionRowProps) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors text-left",
      selected
        ? "border-primary/50 bg-primary/5"
        : "border-border bg-card hover:bg-secondary/30"
    )}
  >
    <div>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {sublabel && <span className="text-xs text-muted-foreground ml-2">{sublabel}</span>}
    </div>
    {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
  </button>
);

const UnitPreferences = () => {
  const {
    weightUnit, measurementUnit, distanceUnit,
    setWeightUnit, setMeasurementUnit, setDistanceUnit,
    loading,
  } = useUnitPreferences();

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5" /> Units
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Weight */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Weight</p>
          <div className="space-y-1.5">
            <OptionRow
              label="Pounds"
              sublabel="lbs"
              selected={weightUnit === "lbs"}
              onClick={() => setWeightUnit("lbs")}
            />
            <OptionRow
              label="Kilograms"
              sublabel="kg"
              selected={weightUnit === "kg"}
              onClick={() => setWeightUnit("kg")}
            />
          </div>
        </div>

        {/* Body Measurements */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Body Measurements</p>
          <div className="space-y-1.5">
            <OptionRow
              label="Inches"
              sublabel="in"
              selected={measurementUnit === "in"}
              onClick={() => setMeasurementUnit("in")}
            />
            <OptionRow
              label="Centimeters"
              sublabel="cm"
              selected={measurementUnit === "cm"}
              onClick={() => setMeasurementUnit("cm")}
            />
          </div>
        </div>

        {/* Distance */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Distance</p>
          <div className="space-y-1.5">
            <OptionRow
              label="Miles"
              sublabel="mi"
              selected={distanceUnit === "miles"}
              onClick={() => setDistanceUnit("miles")}
            />
            <OptionRow
              label="Kilometers"
              sublabel="km"
              selected={distanceUnit === "km"}
              onClick={() => setDistanceUnit("km")}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UnitPreferences;
