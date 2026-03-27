import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "@/components/ui/tooltip";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from "@/components/ui/sheet";
import {
  AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Minus,
  Pill, Eye, EyeOff, Star, Lightbulb, ChevronRight, Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MICRONUTRIENTS, NutrientInfo, BIOAVAILABILITY_FORMS } from "@/lib/micronutrients";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, ReferenceLine, Tooltip as RechartsTooltip } from "recharts";

// ═══ Types ═══

interface DisplayConfig {
  nutrient_key: string;
  display_name: string;
  category: string;
  tier: number;
  default_target_male: number | null;
  default_target_female: number | null;
  unit: string;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  why_it_matters: string | null;
  top_food_sources: string[] | null;
}

interface ClientOverride {
  nutrient_key: string;
  custom_target: number | null;
  custom_tier: number | null;
  is_hidden: boolean;
  coach_notes: string | null;
}

type StatusInfo = {
  label: string;
  color: string; // tailwind text class
  barColor: string; // tailwind bg class
  level: number; // 0-5 for sorting
};

type SourceFilter = "combined" | "food" | "supplements";

interface MicronutrientDashboardProps {
  date?: string;
  clientId?: string;
}

// ═══ Status Logic ═══

function getSmartStatus(
  intake: number,
  target: number,
  hasLoggedToday: boolean
): StatusInfo {
  if (!hasLoggedToday) {
    return { label: "Not tracked yet", color: "text-muted-foreground", barColor: "", level: 0 };
  }
  const pct = target > 0 ? (intake / target) * 100 : 0;
  if (pct > 200) return { label: "High intake", color: "text-amber-400", barColor: "bg-amber-500", level: 5 };
  if (pct >= 100) return { label: "On track", color: "text-emerald-400", barColor: "bg-emerald-500", level: 4 };
  if (pct >= 75) return { label: "Almost there", color: "text-emerald-300", barColor: "bg-emerald-400/70", level: 3 };
  if (pct >= 25) return { label: "Getting there", color: "text-primary", barColor: "bg-primary", level: 2 };
  return { label: "Needs attention", color: "text-amber-400", barColor: "bg-amber-500/70", level: 1 };
}

// ═══ Smart Suggestions ═══

const SUGGESTIONS: Record<string, string> = {
  vitamin_d_mcg: "Tip: 15 minutes of midday sun or a Vitamin D3 supplement can help.",
  magnesium_mg: "Tip: Dark chocolate, almonds, and spinach are great magnesium sources.",
  omega_3: "Tip: Two servings of fatty fish per week covers your Omega-3 needs.",
  zinc_mg: "Tip: Pumpkin seeds and beef are excellent sources of zinc.",
  vitamin_b12_mcg: "Tip: Beef, salmon, and eggs are naturally rich in B12.",
  iron_mg: "Tip: Pair iron-rich foods with vitamin C to boost absorption.",
  vitamin_c_mg: "Tip: A single red bell pepper has over 150mg of vitamin C.",
  potassium_mg: "Tip: A potato or banana can significantly boost your potassium.",
  calcium_mg: "Tip: Yogurt and sardines (with bones) are calcium powerhouses.",
  selenium_mcg: "Tip: Just 1-2 Brazil nuts per day covers your selenium needs.",
};

// ═══ Main Component ═══

const MicronutrientDashboard = ({ date, clientId }: MicronutrientDashboardProps) => {
  const { user } = useAuth();
  const targetId = clientId || user?.id;
  const today = date || new Date().toLocaleDateString("en-CA");

  const [displayConfig, setDisplayConfig] = useState<DisplayConfig[]>([]);
  const [overrides, setOverrides] = useState<ClientOverride[]>([]);
  const [foodIntakes, setFoodIntakes] = useState<Record<string, number>>({});
  const [supplementIntakes, setSupplementIntakes] = useState<Record<string, number>>({});
  const [customTargets, setCustomTargets] = useState<Record<string, number>>({});
  const [hasLoggedToday, setHasLoggedToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("combined");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [detailNutrient, setDetailNutrient] = useState<string | null>(null);
  const [weekHistory, setWeekHistory] = useState<Record<string, { day: string; value: number }[]>>({});
  const [prevWeekAvg, setPrevWeekAvg] = useState<Record<string, number>>({});
  const [currWeekAvg, setCurrWeekAvg] = useState<Record<string, number>>({});
  const [suppRefresh, setSuppRefresh] = useState(0);

  // Listen for supplement log changes from sibling tabs
  useEffect(() => {
    const handler = () => setSuppRefresh((c) => c + 1);
    window.addEventListener("supplement-logs-updated", handler);
    return () => window.removeEventListener("supplement-logs-updated", handler);
  }, []);

  // ═══ Data Loading ═══
  useEffect(() => {
    if (!targetId) return;
    const load = async () => {
      setLoading(true);
      const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const fourteenDaysAgo = format(subDays(new Date(), 13), "yyyy-MM-dd");

      const [
        { data: config },
        { data: clientOverrides },
        { data: todayLogs },
        { data: todaySuppLogs },
        { data: weekLogs },
        { data: weekSuppLogs },
        { data: prevLogs },
        { data: prevSuppLogs },
        { data: targetsRow },
      ] = await Promise.all([
        supabase.from("micronutrient_display_config").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("client_micronutrient_overrides").select("*").eq("client_id", targetId),
        supabase.from("nutrition_logs").select("*").eq("client_id", targetId).eq("logged_at", today),
        supabase.from("supplement_logs").select("servings, supplement_id, supplements(*)").eq("client_id", targetId).eq("logged_at", today),
        supabase.from("nutrition_logs").select("*").eq("client_id", targetId).gte("logged_at", sevenDaysAgo),
        supabase.from("supplement_logs").select("servings, supplement_id, supplements(*)").eq("client_id", targetId).gte("logged_at", sevenDaysAgo),
        supabase.from("nutrition_logs").select("*").eq("client_id", targetId).gte("logged_at", fourteenDaysAgo).lt("logged_at", sevenDaysAgo),
        supabase.from("supplement_logs").select("servings, supplement_id, supplements(*)").eq("client_id", targetId).gte("logged_at", fourteenDaysAgo).lt("logged_at", sevenDaysAgo),
        supabase.from("micronutrient_targets").select("*").eq("client_id", targetId).limit(1).maybeSingle(),
      ]);

      setDisplayConfig((config as any[]) || []);
      setOverrides((clientOverrides as any[]) || []);

      const hasFoodToday = (todayLogs || []).length > 0;
      const hasSuppToday = (todaySuppLogs || []).length > 0;
      setHasLoggedToday(hasFoodToday || hasSuppToday);

      // Aggregate today's food intakes
      const fi: Record<string, number> = {};
      (todayLogs || []).forEach((log: any) => {
        MICRONUTRIENTS.forEach((n) => { fi[n.key] = (fi[n.key] || 0) + (log[n.key] || 0); });
      });
      setFoodIntakes(fi);

      // Aggregate today's supplement intakes
      const si: Record<string, number> = {};
      (todaySuppLogs || []).forEach((sl: any) => {
        if (!sl.supplements) return;
        const s = sl.supplements;
        const servings = sl.servings || 1;
        MICRONUTRIENTS.forEach((n) => { si[n.key] = (si[n.key] || 0) + ((s[n.key] || 0) * servings); });
      });
      setSupplementIntakes(si);

      // Custom targets from coach
      if (targetsRow) {
        const t: Record<string, number> = {};
        MICRONUTRIENTS.forEach((n) => {
          const val = targetsRow[n.key as keyof typeof targetsRow] as number;
          if (val) t[n.key] = val;
        });
        setCustomTargets(t);
      }

      // Current week daily history (for detail drill-down)
      const dailyMap: Record<string, Record<string, number>> = {};
      (weekLogs || []).forEach((log: any) => {
        const d = log.logged_at;
        if (!dailyMap[d]) dailyMap[d] = {};
        MICRONUTRIENTS.forEach((n) => { dailyMap[d][n.key] = (dailyMap[d][n.key] || 0) + (log[n.key] || 0); });
      });
      (weekSuppLogs || []).forEach((sl: any) => {
        if (!sl.supplements) return;
        const d = sl.logged_at || today;
        if (!dailyMap[d]) dailyMap[d] = {};
        const s = sl.supplements;
        const servings = sl.servings || 1;
        MICRONUTRIENTS.forEach((n) => { dailyMap[d][n.key] = (dailyMap[d][n.key] || 0) + ((s[n.key] || 0) * servings); });
      });

      // Build 7-day history per nutrient
      const hist: Record<string, { day: string; value: number }[]> = {};
      const cAvg: Record<string, number> = {};
      const dates = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), "yyyy-MM-dd"));
      MICRONUTRIENTS.forEach((n) => {
        hist[n.key] = dates.map((d) => ({ day: format(new Date(d + "T12:00:00"), "EEE"), value: dailyMap[d]?.[n.key] || 0 }));
        cAvg[n.key] = dates.reduce((sum, d) => sum + (dailyMap[d]?.[n.key] || 0), 0) / 7;
      });
      setWeekHistory(hist);
      setCurrWeekAvg(cAvg);

      // Previous week averages
      const prevDailyMap: Record<string, Record<string, number>> = {};
      (prevLogs || []).forEach((log: any) => {
        const d = log.logged_at;
        if (!prevDailyMap[d]) prevDailyMap[d] = {};
        MICRONUTRIENTS.forEach((n) => { prevDailyMap[d][n.key] = (prevDailyMap[d][n.key] || 0) + (log[n.key] || 0); });
      });
      (prevSuppLogs || []).forEach((sl: any) => {
        if (!sl.supplements) return;
        const d = sl.logged_at || today;
        if (!prevDailyMap[d]) prevDailyMap[d] = {};
        const s = sl.supplements;
        const servings = sl.servings || 1;
        MICRONUTRIENTS.forEach((n) => { prevDailyMap[d][n.key] = (prevDailyMap[d][n.key] || 0) + ((s[n.key] || 0) * servings); });
      });
      const pAvg: Record<string, number> = {};
      const prevDays = Object.keys(prevDailyMap);
      MICRONUTRIENTS.forEach((n) => {
        if (prevDays.length === 0) { pAvg[n.key] = 0; return; }
        let sum = 0;
        prevDays.forEach((d) => { sum += prevDailyMap[d]?.[n.key] || 0; });
        pAvg[n.key] = sum / prevDays.length;
      });
      setPrevWeekAvg(pAvg);

      setLoading(false);
    };
    load();
  }, [targetId, today, suppRefresh]);

  // ═══ Derived Data ═══

  const overrideMap = useMemo(() => {
    const m: Record<string, ClientOverride> = {};
    overrides.forEach((o) => { m[o.nutrient_key] = o; });
    return m;
  }, [overrides]);

  const configMap = useMemo(() => {
    const m: Record<string, DisplayConfig> = {};
    displayConfig.forEach((c) => { m[c.nutrient_key] = c; });
    return m;
  }, [displayConfig]);

  // Nutrients to exclude from micros dashboard entirely
  const EXCLUDED_KEYS = useMemo(() => new Set(["fiber", "cholesterol", "omega_6"]), []);

  // Build merged nutrient list with effective tier/target
  const mergedNutrients = useMemo(() => {
    return displayConfig
      .filter((c) => c.is_active && !EXCLUDED_KEYS.has(c.nutrient_key))
      .map((c) => {
        const override = overrideMap[c.nutrient_key];
        if (override?.is_hidden) return null;
        const microDef = MICRONUTRIENTS.find((m) => m.key === c.nutrient_key);
        if (!microDef) return null;
        const effectiveTier = override?.custom_tier ?? c.tier;
        const effectiveTarget =
          override?.custom_target ??
          customTargets[c.nutrient_key] ??
          (c.default_target_male ?? microDef.pcOptimalMin);
        return {
          config: c,
          microDef,
          tier: effectiveTier,
          target: effectiveTarget,
          override,
          sortOrder: c.sort_order,
        };
      })
      .filter(Boolean) as {
        config: DisplayConfig;
        microDef: NutrientInfo;
        tier: number;
        target: number;
        override?: ClientOverride;
        sortOrder: number;
      }[];
  }, [displayConfig, overrideMap, customTargets, EXCLUDED_KEYS]);

  // Get intake for current source filter
  const getIntake = useCallback((key: string): number => {
    if (sourceFilter === "food") return foodIntakes[key] || 0;
    if (sourceFilter === "supplements") return supplementIntakes[key] || 0;
    return (foodIntakes[key] || 0) + (supplementIntakes[key] || 0);
  }, [sourceFilter, foodIntakes, supplementIntakes]);

  // Combined intake (always for top priorities card)
  const getCombinedIntake = useCallback((key: string): number => {
    return (foodIntakes[key] || 0) + (supplementIntakes[key] || 0);
  }, [foodIntakes, supplementIntakes]);

  // Visible nutrients based on advanced toggle
  const visibleNutrients = useMemo(() => {
    return mergedNutrients
      .filter((n) => showAdvanced || n.tier <= 2)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [mergedNutrients, showAdvanced]);

  // Top priorities (always combined, tier 1+2 only)
  const topPriorities = useMemo(() => {
    if (!hasLoggedToday) return [];
    return mergedNutrients
      .filter((n) => n.tier <= 2)
      .map((n) => {
        const intake = getCombinedIntake(n.config.nutrient_key);
        const pct = n.target > 0 ? Math.round((intake / n.target) * 100) : 0;
        return { ...n, intake, pct };
      })
      .filter((n) => n.pct < 75)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);
  }, [mergedNutrients, getCombinedIntake, hasLoggedToday]);

  const allAbove75 = useMemo(() => {
    if (!hasLoggedToday) return false;
    return mergedNutrients
      .filter((n) => n.tier <= 2)
      .every((n) => {
        const intake = getCombinedIntake(n.config.nutrient_key);
        return n.target > 0 ? (intake / n.target) >= 0.75 : true;
      });
  }, [mergedNutrients, getCombinedIntake, hasLoggedToday]);

  // Smart suggestion based on lowest tier 1 nutrient
  const smartSuggestion = useMemo(() => {
    if (!hasLoggedToday) return null;
    const lowestT1 = mergedNutrients
      .filter((n) => n.tier === 1)
      .map((n) => ({
        key: n.config.nutrient_key,
        pct: n.target > 0 ? getCombinedIntake(n.config.nutrient_key) / n.target : 1,
      }))
      .sort((a, b) => a.pct - b.pct)[0];
    if (!lowestT1) return null;
    if (lowestT1.pct >= 0.5) {
      // All tier 1 above 50%
      return "Great progress! You're covering your key nutrients today.";
    }
    return SUGGESTIONS[lowestT1.key] || null;
  }, [mergedNutrients, getCombinedIntake, hasLoggedToday]);

  // Contribution summary for Food/Supps tabs
  const contributionPct = useMemo(() => {
    if (sourceFilter === "combined") return null;
    let totalTarget = 0;
    let totalContrib = 0;
    mergedNutrients.filter((n) => n.tier <= 2).forEach((n) => {
      totalTarget += n.target;
      totalContrib += sourceFilter === "food"
        ? (foodIntakes[n.config.nutrient_key] || 0)
        : (supplementIntakes[n.config.nutrient_key] || 0);
    });
    return totalTarget > 0 ? Math.round((totalContrib / totalTarget) * 100) : 0;
  }, [sourceFilter, mergedNutrients, foodIntakes, supplementIntakes]);

  // Trend arrow helper
  const getTrend = useCallback((key: string): "up" | "down" | "flat" | null => {
    const curr = currWeekAvg[key] || 0;
    const prev = prevWeekAvg[key] || 0;
    // Need some data in both windows
    if (curr === 0 && prev === 0) return null;
    if (prev === 0) return curr > 0 ? "up" : null;
    const change = (curr - prev) / prev;
    if (change > 0.1) return "up";
    if (change < -0.1) return "down";
    return "flat";
  }, [currWeekAvg, prevWeekAvg]);

  // Group visible nutrients for display
  const tier1Nutrients = useMemo(() => visibleNutrients.filter((n) => n.tier === 1), [visibleNutrients]);
  const tier2Nutrients = useMemo(() => visibleNutrients.filter((n) => n.tier === 2), [visibleNutrients]);
  const tier3Nutrients = useMemo(() => visibleNutrients.filter((n) => n.tier === 3), [visibleNutrients]);

  // Detail sheet data
  const detailData = useMemo(() => {
    if (!detailNutrient) return null;
    const n = mergedNutrients.find((m) => m.config.nutrient_key === detailNutrient);
    if (!n) return null;
    return {
      ...n,
      intake: getCombinedIntake(n.config.nutrient_key),
      foodAmount: foodIntakes[n.config.nutrient_key] || 0,
      suppAmount: supplementIntakes[n.config.nutrient_key] || 0,
      history: weekHistory[n.config.nutrient_key] || [],
    };
  }, [detailNutrient, mergedNutrients, getCombinedIntake, foodIntakes, supplementIntakes, weekHistory]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-secondary rounded-lg" />)}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* ═══ Top Priorities Card ═══ */}
        <Card className="border-primary/20">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">Today's Focus</p>
            {!hasLoggedToday ? (
              <p className="text-sm text-muted-foreground">Log a meal or supplement to see your priorities</p>
            ) : allAbove75 ? (
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Looking good today</span>
              </div>
            ) : (
              <div className="flex gap-4">
                {topPriorities.map((p) => (
                  <div key={p.config.nutrient_key} className="flex items-center gap-2.5 flex-1 min-w-0">
                    {/* Mini donut */}
                    <div className="relative h-10 w-10 shrink-0">
                      <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
                        <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
                        <circle
                          cx="18" cy="18" r="14" fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth="3"
                          strokeDasharray={`${Math.min(p.pct, 100) * 0.88} 88`}
                          strokeLinecap="round"
                          className="transition-all duration-700 ease-out"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
                        {p.pct}%
                      </span>
                    </div>
                    <span className="text-xs font-medium text-foreground truncate">{p.config.display_name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ Smart Suggestion ═══ */}
        {smartSuggestion && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/50">
            <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">{smartSuggestion}</p>
          </div>
        )}

        {/* ═══ Source Filter + Advanced Toggle ═══ */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 p-0.5 rounded-md bg-secondary w-fit">
            {(["combined", "food", "supplements"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSourceFilter(mode)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-sm transition-all",
                  sourceFilter === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "combined" ? "Combined" : mode === "food" ? "Food" : "Supps"}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showAdvanced ? "Simple" : "Advanced"}
          </Button>
        </div>

        {/* Contribution summary for food/supps tabs */}
        {contributionPct !== null && (
          <p className="text-xs text-muted-foreground px-1">
            {sourceFilter === "food" ? "Food" : "Supplements"} contributes ~{contributionPct}% of your daily micros
          </p>
        )}

        {/* ═══ Your Priorities (Tier 1) ═══ */}
        <NutrientSection
          title="Your Priorities"
          icon={<Star className="h-3.5 w-3.5 text-primary" />}
          nutrients={tier1Nutrients}
          getIntake={getIntake}
          hasLoggedToday={hasLoggedToday}
          foodIntakes={foodIntakes}
          supplementIntakes={supplementIntakes}
          getTrend={getTrend}
          showTier1Star
          onOpenDetail={setDetailNutrient}
          configMap={configMap}
        />

        {/* ═══ Supporting Nutrients (Tier 2) ═══ */}
        {tier2Nutrients.length > 0 && (
          <NutrientSection
            title="Supporting Nutrients"
            nutrients={tier2Nutrients}
            getIntake={getIntake}
            hasLoggedToday={hasLoggedToday}
            foodIntakes={foodIntakes}
            supplementIntakes={supplementIntakes}
            getTrend={getTrend}
            onOpenDetail={setDetailNutrient}
            configMap={configMap}
          />
        )}

        {/* ═══ Additional Tracking (Tier 3 — Advanced Only) ═══ */}
        {showAdvanced && tier3Nutrients.length > 0 && (
          <NutrientSection
            title="Additional Tracking"
            nutrients={tier3Nutrients}
            getIntake={getIntake}
            hasLoggedToday={hasLoggedToday}
            foodIntakes={foodIntakes}
            supplementIntakes={supplementIntakes}
            getTrend={getTrend}
            onOpenDetail={setDetailNutrient}
            configMap={configMap}
          />
        )}

        {/* ═══ Nutrient Detail Sheet ═══ */}
        <Sheet open={!!detailNutrient} onOpenChange={(open) => { if (!open) setDetailNutrient(null); }}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
            {detailData && (
              <div className="space-y-5 pb-6">
                <SheetHeader>
                  <SheetTitle className="text-foreground flex items-center gap-2">
                    {detailData.config.display_name}
                    <Badge variant="outline" className="text-[10px]">
                      {detailData.config.unit}
                    </Badge>
                  </SheetTitle>
                </SheetHeader>

                {/* Description */}
                {detailData.config.description && (
                  <p className="text-sm text-muted-foreground">{detailData.config.description}</p>
                )}

                {/* Why it matters */}
                {detailData.config.why_it_matters && (
                  <div className="bg-secondary/50 rounded-lg p-3 border border-border/50">
                    <p className="text-xs font-medium text-foreground mb-1">Why it matters for you</p>
                    <p className="text-xs text-muted-foreground">{detailData.config.why_it_matters}</p>
                  </div>
                )}

                {/* Coach override note */}
                {detailData.override?.coach_notes && (
                  <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
                    <p className="text-xs text-primary">
                      Your coach set a custom target of {detailData.override.custom_target}{detailData.config.unit}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{detailData.override.coach_notes}</p>
                  </div>
                )}

                {/* Intake breakdown */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Today's Breakdown</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-secondary rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-foreground">{detailData.intake.toFixed(1)}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                    <div className="bg-secondary rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-foreground">{detailData.foodAmount.toFixed(1)}</p>
                      <p className="text-[10px] text-muted-foreground">From Food</p>
                    </div>
                    <div className="bg-secondary rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-primary">{detailData.suppAmount.toFixed(1)}</p>
                      <p className="text-[10px] text-muted-foreground">From Supps</p>
                    </div>
                  </div>
                </div>

                {/* 7-day chart */}
                {detailData.history.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Last 7 Days</p>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={detailData.history} barSize={20}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={40} />
                          <ReferenceLine y={detailData.target} stroke="hsl(var(--primary))" strokeDasharray="6 3" />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 8,
                              color: "hsl(var(--foreground))",
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Top food sources */}
                {detailData.config.top_food_sources && (detailData.config.top_food_sources as string[]).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">
                      Foods high in {detailData.config.display_name}
                    </p>
                    <div className="space-y-1">
                      {(detailData.config.top_food_sources as string[]).map((src, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="text-primary">•</span>
                          {src}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bioavailability forms */}
                {BIOAVAILABILITY_FORMS[detailData.config.nutrient_key] && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Supplement Forms (by absorption)</p>
                    <div className="space-y-1">
                      {BIOAVAILABILITY_FORMS[detailData.config.nutrient_key].map((f) => (
                        <div key={f.form} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{f.label}</span>
                          <Badge variant="outline" className={cn(
                            "text-[10px]",
                            f.multiplier >= 0.85 ? "text-emerald-400 border-emerald-500/30" :
                            f.multiplier >= 0.7 ? "text-primary border-primary/30" :
                            "text-muted-foreground"
                          )}>
                            {Math.round(f.multiplier * 100)}% absorption
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
};

// ═══ Nutrient Section ═══

interface NutrientSectionProps {
  title: string;
  icon?: React.ReactNode;
  nutrients: {
    config: DisplayConfig;
    microDef: NutrientInfo;
    tier: number;
    target: number;
    override?: ClientOverride;
    sortOrder: number;
  }[];
  getIntake: (key: string) => number;
  hasLoggedToday: boolean;
  foodIntakes: Record<string, number>;
  supplementIntakes: Record<string, number>;
  getTrend: (key: string) => "up" | "down" | "flat" | null;
  showTier1Star?: boolean;
  onOpenDetail: (key: string) => void;
  configMap: Record<string, DisplayConfig>;
}

const NutrientSection = ({
  title, icon, nutrients, getIntake, hasLoggedToday,
  foodIntakes, supplementIntakes, getTrend, showTier1Star,
  onOpenDetail, configMap,
}: NutrientSectionProps) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm text-foreground flex items-center gap-1.5">
        {icon}
        {title}
        <span className="text-[10px] text-muted-foreground font-normal ml-1">({nutrients.length})</span>
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-0.5">
      {nutrients.map((n) => (
        <NutrientRow
          key={n.config.nutrient_key}
          config={n.config}
          target={n.target}
          intake={getIntake(n.config.nutrient_key)}
          hasLoggedToday={hasLoggedToday}
          hasSupplement={(supplementIntakes[n.config.nutrient_key] || 0) > 0}
          trend={getTrend(n.config.nutrient_key)}
          showStar={showTier1Star}
          onOpenDetail={() => onOpenDetail(n.config.nutrient_key)}
        />
      ))}
    </CardContent>
  </Card>
);

// ═══ Nutrient Row ═══

interface NutrientRowProps {
  config: DisplayConfig;
  target: number;
  intake: number;
  hasLoggedToday: boolean;
  hasSupplement: boolean;
  trend: "up" | "down" | "flat" | null;
  showStar?: boolean;
  onOpenDetail: () => void;
}

const NutrientRow = ({
  config, target, intake, hasLoggedToday, hasSupplement, trend, showStar, onOpenDetail,
}: NutrientRowProps) => {
  const status = getSmartStatus(intake, target, hasLoggedToday);
  const pct = target > 0 ? Math.min(Math.round((intake / target) * 100), 100) : 0;
  const isUntracked = !hasLoggedToday;

  return (
    <button
      onClick={onOpenDetail}
      className="w-full text-left space-y-1.5 py-2 hover:bg-secondary/30 rounded-sm px-1.5 -mx-1 transition-colors group"
    >
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {showStar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Star className="h-3 w-3 text-primary shrink-0 fill-primary" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px]">
                <p className="text-xs">{config.why_it_matters || "Priority nutrient for your goals"}</p>
              </TooltipContent>
            </Tooltip>
          )}
          <span className="font-medium text-foreground truncate">{config.display_name}</span>
          {hasSupplement && <Pill className="h-3 w-3 text-primary shrink-0" />}
          {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />}
          {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive shrink-0" />}
          {trend === "flat" && <Minus className="h-3 w-3 text-muted-foreground shrink-0" />}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("tabular-nums", status.color)}>
            {intake.toFixed(1)}/{target}{config.unit}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[9px] px-1.5 py-0 border-none whitespace-nowrap", status.color)}
          >
            {status.label}
          </Badge>
          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
      </div>
      {/* Progress bar */}
      <div className={cn(
        "h-1.5 rounded-full overflow-hidden",
        isUntracked ? "border border-dashed border-muted-foreground/30" : "bg-secondary"
      )}>
        {!isUntracked && (
          <div
            className={cn("h-full rounded-full transition-all duration-[400ms] ease-out", status.barColor)}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </button>
  );
};

export default MicronutrientDashboard;
