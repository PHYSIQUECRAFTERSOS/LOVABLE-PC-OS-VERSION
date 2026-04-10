import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveDayType, type DayType } from "@/utils/resolveDayType";
import { Skeleton } from "@/components/ui/skeleton";
import { Target } from "lucide-react";

interface NutritionGoalComparisonProps {
  clientId: string;
  date: Date;
  logged: { calories: number; protein: number; carbs: number; fat: number } | null;
  isCoach: boolean;
}

interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dayType: DayType;
}

const MACRO_COLORS = {
  protein: "#4A9EFF",
  carbs: "#D4A017",
  fat: "#FF6B6B",
};

function MacroProgressBar({
  label,
  logged,
  target,
  color,
}: {
  label: string;
  logged: number;
  target: number;
  color: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const diff = target - logged;
  const pct = target > 0 ? Math.min(logged / target, 1.0) : 0;

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px]" style={{ color: "#CCCCCC" }}>{label}</span>
        <span className="text-[13px] tabular-nums text-foreground">
          {Math.round(logged)}g / {Math.round(target)}g
        </span>
      </div>
      <div className="w-full h-2 rounded" style={{ backgroundColor: "#2a2a2a" }}>
        <div
          className="h-full rounded transition-all duration-300"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
      <DiffLabel diff={diff} unit="g" />
      {showTooltip && (
        <div
          className="absolute z-50 -top-[72px] left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            background: "#1a1a1a",
            border: "1px solid #333333",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            color: "white",
            whiteSpace: "nowrap",
          }}
        >
          <div>Logged: {Math.round(logged)}g</div>
          <div>Target: {Math.round(target)}g</div>
          <div>
            Difference:{" "}
            {diff > 0
              ? `-${Math.round(diff)}g remaining`
              : diff < 0
                ? `+${Math.round(Math.abs(diff))}g over`
                : "Goal met"}
          </div>
        </div>
      )}
    </div>
  );
}

function DiffLabel({ diff, unit = "kcal" }: { diff: number; unit?: string }) {
  if (diff > 0) {
    return (
      <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: "#888888" }}>
        {Math.round(diff)} {unit} remaining
      </p>
    );
  }
  if (diff === 0) {
    return (
      <p className="text-[11px] mt-0.5 font-semibold" style={{ color: "#D4A017" }}>
        Goal met
      </p>
    );
  }
  return (
    <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: "#FF4444" }}>
      +{Math.round(Math.abs(diff))} {unit} over
    </p>
  );
}

function MacroDonut({
  protein,
  carbs,
  fat,
  size = 120,
}: {
  protein: number;
  carbs: number;
  fat: number;
  size?: number;
}) {
  const total = protein + carbs + fat;
  const r = (size - 16) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const strokeWidth = 14;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <svg width={size} height={size}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#2a2a2a"
            strokeWidth={strokeWidth}
          />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#555555"
            fontSize={12}
          >
            No data
          </text>
        </svg>
      </div>
    );
  }

  const segments = [
    { value: protein, color: MACRO_COLORS.protein },
    { value: carbs, color: MACRO_COLORS.carbs },
    { value: fat, color: MACRO_COLORS.fat },
  ];

  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const dashArray = `${pct * circumference} ${circumference}`;
    const dashOffset = -offset;
    offset += pct * circumference;
    return { ...seg, dashArray, dashOffset };
  });

  const proteinPct = Math.round((protein / total) * 100);
  const carbsPct = Math.round((carbs / total) * 100);
  const fatPct = Math.round((fat / total) * 100);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth={strokeWidth}
        />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDasharray={arc.dashArray}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      {/* Legend */}
      <div className="space-y-1 w-full">
        {[
          { label: "Protein", pct: proteinPct, g: protein, color: MACRO_COLORS.protein },
          { label: "Carbs", pct: carbsPct, g: carbs, color: MACRO_COLORS.carbs },
          { label: "Fat", pct: fatPct, g: fat, color: MACRO_COLORS.fat },
        ].map((m) => (
          <div key={m.label} className="flex items-center gap-2 text-[12px]">
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: m.color }}
            />
            <span className="text-muted-foreground">
              {m.label} eaten ({m.pct}% / {Math.round(m.g)}g)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <Skeleton className="h-8 w-full rounded" />
      <Skeleton className="h-8 w-full rounded" />
      <Skeleton className="h-8 w-full rounded" />
      <Skeleton className="h-8 w-full rounded" />
      <div className="flex justify-center pt-2">
        <Skeleton className="h-[120px] w-[120px] rounded-full" />
      </div>
    </div>
  );
}

function NoGoalPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Target className="h-8 w-8" style={{ color: "#555555" }} />
      <p className="text-sm font-medium" style={{ color: "#555555" }}>
        No nutrition goal set
      </p>
      <p className="text-xs text-center" style={{ color: "#555555" }}>
        Set a goal in the client's Nutrition tab
      </p>
    </div>
  );
}

export default function NutritionGoalComparison({
  clientId,
  date,
  logged,
  isCoach,
}: NutritionGoalComparisonProps) {
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [noGoal, setNoGoal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNoGoal(false);

    const dateStr = date.toLocaleDateString("en-CA");

    const fetchAll = async () => {
      const [goalResult, dayTypeResult] = await Promise.allSettled([
        supabase
          .from("nutrition_targets")
          .select(
            "calories, protein, carbs, fat, rest_calories, rest_protein, rest_carbs, rest_fat"
          )
          .eq("client_id", clientId)
          .lte("effective_date", dateStr)
          .order("effective_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1),
        resolveDayType(clientId, date),
      ]);

      if (cancelled) return;

      const goalData =
        goalResult.status === "fulfilled" ? goalResult.value.data?.[0] : null;
      const dayType =
        dayTypeResult.status === "fulfilled"
          ? dayTypeResult.value
          : ("training_day" as DayType);

      if (!goalData) {
        setNoGoal(true);
        setLoading(false);
        return;
      }

      const useRest =
        dayType === "rest_day" && goalData.rest_calories != null;
      setTargets({
        calories: useRest ? goalData.rest_calories! : goalData.calories,
        protein: useRest ? (goalData.rest_protein ?? goalData.protein) : goalData.protein,
        carbs: useRest ? (goalData.rest_carbs ?? goalData.carbs) : goalData.carbs,
        fat: useRest ? (goalData.rest_fat ?? goalData.fat) : goalData.fat,
        dayType,
      });
      setLoading(false);
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [clientId, date]);

  const loggedValues = useMemo(
    () => logged || { calories: 0, protein: 0, carbs: 0, fat: 0 },
    [logged]
  );

  if (loading) return <GoalSkeleton />;
  if (noGoal) return <NoGoalPlaceholder />;
  if (!targets) return null;

  const calDiff = targets.calories - loggedValues.calories;
  const calPct =
    targets.calories > 0
      ? Math.min(loggedValues.calories / targets.calories, 1.0)
      : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Nutrition Goal</span>
        <span
          className="text-[11px] font-semibold rounded-full px-2.5 py-0.5"
          style={
            targets.dayType === "training_day"
              ? { backgroundColor: "#D4A017", color: "#1a1a1a" }
              : { backgroundColor: "#2a2a2a", color: "#ffffff", border: "1px solid #444" }
          }
        >
          {targets.dayType === "training_day" ? "Training Day" : "Rest Day"}
        </span>
      </div>

      {/* Calorie bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] text-foreground font-medium">Calories</span>
          <span className="text-[13px] tabular-nums text-foreground">
            {Math.round(loggedValues.calories)} / {Math.round(targets.calories)} kcal
          </span>
        </div>
        <div className="w-full h-2 rounded" style={{ backgroundColor: "#2a2a2a" }}>
          <div
            className="h-full rounded transition-all duration-300"
            style={{ width: `${calPct * 100}%`, backgroundColor: "#D4A017" }}
          />
        </div>
        <DiffLabel diff={calDiff} unit="kcal" />
      </div>

      {/* Macro bars */}
      <MacroProgressBar
        label="Protein"
        logged={loggedValues.protein}
        target={targets.protein}
        color={MACRO_COLORS.protein}
      />
      <MacroProgressBar
        label="Carbs"
        logged={loggedValues.carbs}
        target={targets.carbs}
        color={MACRO_COLORS.carbs}
      />
      <MacroProgressBar
        label="Fat"
        logged={loggedValues.fat}
        target={targets.fat}
        color={MACRO_COLORS.fat}
      />

      {/* Donut chart */}
      <div className="pt-2">
        <MacroDonut
          protein={loggedValues.protein}
          carbs={loggedValues.carbs}
          fat={loggedValues.fat}
        />
      </div>
    </div>
  );
}

// Export for compliance dot usage
export function getComplianceDot(
  logged: number,
  target: number
): { color: string; label: string } | null {
  if (target <= 0) return null;
  const ratio = logged / target;
  if (ratio >= 0.9 && ratio <= 1.1) return { color: "#D4A017", label: "On target" };
  if (ratio < 0.9) return { color: "#EAB308", label: "Under target" };
  return { color: "#FF4444", label: "Over target" };
}
