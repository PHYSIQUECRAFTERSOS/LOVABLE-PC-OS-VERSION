import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  MICRONUTRIENTS, NutrientInfo, calculateOptimizationScore, getDeficiencies,
  getOverconsumption, getOptimizationStatus, OptimizationStatus, BIOAVAILABILITY_FORMS,
  getDuplicateStackingWarnings
} from "@/lib/micronutrients";
import { AlertTriangle, CheckCircle2, TrendingDown, Shield, Pill, ChevronDown, Sparkles, Flame, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface MicronutrientDashboardProps {
  date?: string;
  clientId?: string;
}

type SourceFilter = "combined" | "food" | "supplements";

const STATUS_COLORS: Record<OptimizationStatus, string> = {
  deficient: "bg-destructive/70",
  suboptimal: "bg-yellow-500",
  optimal: "bg-primary",
  caution: "bg-orange-500",
  excessive: "bg-destructive",
};

const STATUS_TEXT: Record<OptimizationStatus, string> = {
  deficient: "text-destructive",
  suboptimal: "text-yellow-400",
  optimal: "text-primary",
  caution: "text-orange-400",
  excessive: "text-destructive",
};

const STATUS_LABELS: Record<OptimizationStatus, string> = {
  deficient: "Deficient",
  suboptimal: "Sub-Optimal",
  optimal: "Optimal",
  caution: "Near Limit",
  excessive: "Exceeds UL",
};

const MicronutrientDashboard = ({ date, clientId }: MicronutrientDashboardProps) => {
  const { user } = useAuth();
  const targetId = clientId || user?.id;
  const today = date || format(new Date(), "yyyy-MM-dd");
  const [foodIntakes, setFoodIntakes] = useState<Record<string, number>>({});
  const [supplementIntakes, setSupplementIntakes] = useState<Record<string, number>>({});
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("combined");
  const [expandedNutrient, setExpandedNutrient] = useState<string | null>(null);
  const [smartWarnings, setSmartWarnings] = useState<string[]>([]);
  const [rolling7Day, setRolling7Day] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!targetId) return;
    const load = async () => {
      setLoading(true);

      // Load 7-day logs for rolling average
      const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const [{ data: logs }, { data: todayLogs }, { data: suppLogs }, { data: weekSuppLogs }, { data: customTargets }] = await Promise.all([
        supabase.from("nutrition_logs").select("*").eq("client_id", targetId).gte("logged_at", sevenDaysAgo),
        supabase.from("nutrition_logs").select("*").eq("client_id", targetId).eq("logged_at", today),
        supabase.from("supplement_logs").select("servings, supplement_id, supplements(*)").eq("client_id", targetId).eq("logged_at", today),
        supabase.from("supplement_logs").select("servings, supplement_id, supplements(*)").eq("client_id", targetId).gte("logged_at", sevenDaysAgo),
        supabase.from("micronutrient_targets").select("*").eq("client_id", targetId).limit(1).maybeSingle(),
      ]);

      // Today's food intakes
      const fi: Record<string, number> = {};
      (todayLogs || []).forEach((log: any) => {
        MICRONUTRIENTS.forEach((n) => { fi[n.key] = (fi[n.key] || 0) + (log[n.key] || 0); });
      });
      setFoodIntakes(fi);

      // Today's supplement intakes
      const si: Record<string, number> = {};
      (suppLogs || []).forEach((sl: any) => {
        if (!sl.supplements) return;
        const s = sl.supplements;
        const servings = sl.servings || 1;
        MICRONUTRIENTS.forEach((n) => { si[n.key] = (si[n.key] || 0) + ((s[n.key] || 0) * servings); });
      });
      setSupplementIntakes(si);

      // 7-day rolling average
      const r7: Record<string, number> = {};
      const allLogs = logs || [];
      const allSuppLogs = weekSuppLogs || [];
      const uniqueDays = new Set(allLogs.map((l: any) => l.logged_at));
      const dayCount = Math.max(uniqueDays.size, 1);

      MICRONUTRIENTS.forEach((n) => {
        let total = 0;
        allLogs.forEach((l: any) => { total += l[n.key] || 0; });
        allSuppLogs.forEach((sl: any) => {
          if (!sl.supplements) return;
          total += (sl.supplements[n.key] || 0) * (sl.servings || 1);
        });
        r7[n.key] = total / dayCount;
      });
      setRolling7Day(r7);

      // Custom targets
      if (customTargets) {
        const t: Record<string, number> = {};
        MICRONUTRIENTS.forEach((n) => {
          const val = customTargets[n.key as keyof typeof customTargets] as number;
          if (val) t[n.key] = val;
        });
        setTargets(t);
      }

      // Smart warnings
      const warnings: string[] = [];
      // Check electrolyte balance
      const totalNa = (fi.sodium || 0) + (si.sodium || 0);
      const totalK = (fi.potassium_mg || 0) + (si.potassium_mg || 0);
      if (totalNa > 0 && totalK > 0 && totalNa / totalK > 2) {
        warnings.push("Sodium-to-potassium ratio is high. Consider increasing potassium intake.");
      }
      // Check 7-day chronic under
      MICRONUTRIENTS.forEach(n => {
        if (n.category === "other") return;
        if (r7[n.key] < n.pcOptimalMin * 0.5 && dayCount >= 3) {
          warnings.push(`${n.label} has been below 50% of optimal for ${dayCount}+ days.`);
        }
      });
      setSmartWarnings(warnings.slice(0, 5));

      setLoading(false);
    };
    load();
  }, [targetId, today]);

  if (loading) {
    return <div className="animate-pulse space-y-4">
      {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-secondary rounded-lg" />)}
    </div>;
  }

  const getIntakes = (): Record<string, number> => {
    const result: Record<string, number> = {};
    MICRONUTRIENTS.forEach(n => {
      if (sourceFilter === "food") result[n.key] = foodIntakes[n.key] || 0;
      else if (sourceFilter === "supplements") result[n.key] = supplementIntakes[n.key] || 0;
      else result[n.key] = (foodIntakes[n.key] || 0) + (supplementIntakes[n.key] || 0);
    });
    return result;
  };

  const intakes = getIntakes();
  const optimizationScore = calculateOptimizationScore(rolling7Day, Object.keys(targets).length > 0 ? targets : undefined);
  const deficiencies = getDeficiencies(intakes, Object.keys(targets).length > 0 ? targets : undefined);
  const overconsumption = getOverconsumption(intakes);

  const renderNutrientRow = (n: NutrientInfo) => {
    const intake = intakes[n.key] || 0;
    const target = targets[n.key] ?? n.pcOptimalMin;
    const pct = target > 0 ? Math.round((intake / target) * 100) : 0;
    const status = getOptimizationStatus(intake, n);
    const suppAmount = supplementIntakes[n.key] || 0;
    const r7Avg = rolling7Day[n.key] || 0;
    const isExpanded = expandedNutrient === n.key;
    const hasForms = BIOAVAILABILITY_FORMS[n.key]?.length > 0;

    return (
      <div key={n.key}>
        <button
          onClick={() => setExpandedNutrient(isExpanded ? null : n.key)}
          className="w-full text-left space-y-1 py-1.5 hover:bg-secondary/30 rounded-sm px-1 -mx-1 transition-colors"
        >
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{n.label}</span>
              {suppAmount > 0 && <Pill className="h-3 w-3 text-primary" />}
              {hasForms && <Sparkles className="h-2.5 w-2.5 text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("tabular-nums", STATUS_TEXT[status])}>
                {intake.toFixed(1)}/{target}{n.unit}
              </span>
              <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border-none", STATUS_TEXT[status])}>
                {STATUS_LABELS[status]}
              </Badge>
            </div>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", STATUS_COLORS[status])}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </button>

        {/* Expanded Detail */}
        {isExpanded && (
          <div className="ml-1 pl-3 border-l-2 border-primary/20 py-2 space-y-1 text-[11px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Today (Food)</span>
              <span className="text-foreground">{(foodIntakes[n.key] || 0).toFixed(1)}{n.unit}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Today (Supps)</span>
              <span className="text-primary">{suppAmount.toFixed(1)}{n.unit}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>7-Day Avg</span>
              <span className="text-foreground">{r7Avg.toFixed(1)}{n.unit}</span>
            </div>
            <div className="h-px bg-border my-1" />
            <div className="flex justify-between text-muted-foreground">
              <span>RDA</span><span>{n.rda}{n.unit}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>PC Optimal</span>
              <span className="text-primary">{n.pcOptimalMin}–{n.pcOptimalMax}{n.unit}</span>
            </div>
            {n.upperLimit && (
              <div className="flex justify-between text-muted-foreground">
                <span>Upper Limit</span><span className="text-destructive">{n.upperLimit}{n.unit}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Optimization Score */}
      <Card className="border-primary/20 glow-gold">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold border-2",
                optimizationScore >= 80 ? "border-primary bg-primary/10 text-primary" :
                optimizationScore >= 50 ? "border-yellow-500 bg-yellow-500/10 text-yellow-400" :
                "border-destructive bg-destructive/10 text-destructive"
              )}>
                {optimizationScore}
              </div>
              <div>
                <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-primary" />
                  Optimization Score
                </h3>
                <p className="text-xs text-muted-foreground">
                  {optimizationScore >= 80 ? "Elite coverage — well optimized" :
                   optimizationScore >= 60 ? "Good — a few gaps to close" :
                   optimizationScore >= 40 ? "Moderate — needs attention" :
                   "Low — significant gaps detected"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Based on 7-day rolling average</p>
              </div>
            </div>
            <div className="text-right space-y-1">
              {deficiencies.length > 0 && (
                <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 text-[10px]">
                  <TrendingDown className="h-3 w-3 mr-1" />{deficiencies.length} low
                </Badge>
              )}
              {overconsumption.length > 0 && (
                <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" />{overconsumption.length} high
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Smart Warnings */}
      {smartWarnings.length > 0 && (
        <Card className="border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-foreground">
              <Flame className="h-4 w-4 text-orange-400" />
              Smart Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {smartWarnings.map((w, i) => (
              <p key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0 mt-0.5" />
                {w}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Source Filter Toggle */}
      <div className="flex gap-1 p-0.5 rounded-md bg-secondary w-fit">
        {(["combined", "food", "supplements"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSourceFilter(mode)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-sm transition-all capitalize",
              sourceFilter === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {mode === "combined" ? "Combined" : mode === "food" ? "Food Only" : "Supps Only"}
          </button>
        ))}
      </div>

      {/* Nutrient Breakdown */}
      <Tabs defaultValue="vitamins">
        <TabsList className="w-full">
          <TabsTrigger value="vitamins" className="flex-1">Vitamins</TabsTrigger>
          <TabsTrigger value="minerals" className="flex-1">Minerals</TabsTrigger>
          <TabsTrigger value="fatty_acids" className="flex-1">Fatty Acids</TabsTrigger>
        </TabsList>

        <TabsContent value="vitamins">
          <Card>
            <CardContent className="pt-4 space-y-1">
              {MICRONUTRIENTS.filter((n) => n.category === "vitamin").map(renderNutrientRow)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="minerals">
          <Card>
            <CardContent className="pt-4 space-y-1">
              {MICRONUTRIENTS.filter((n) => n.category === "mineral").map(renderNutrientRow)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fatty_acids">
          <Card>
            <CardContent className="pt-4 space-y-1">
              {MICRONUTRIENTS.filter((n) => n.category === "fatty_acid").map(renderNutrientRow)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MicronutrientDashboard;
