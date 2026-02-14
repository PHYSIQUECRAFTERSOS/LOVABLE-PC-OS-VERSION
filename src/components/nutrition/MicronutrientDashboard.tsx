import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MICRONUTRIENTS, NutrientInfo, calculateAdequacyScore, getDeficiencies, getOverconsumption } from "@/lib/micronutrients";
import { AlertTriangle, CheckCircle2, TrendingDown, Shield, Pill } from "lucide-react";
import { cn } from "@/lib/utils";

interface MicronutrientDashboardProps {
  date?: string;
  clientId?: string;
}

const MicronutrientDashboard = ({ date, clientId }: MicronutrientDashboardProps) => {
  const { user } = useAuth();
  const targetId = clientId || user?.id;
  const today = date || format(new Date(), "yyyy-MM-dd");
  const [intakes, setIntakes] = useState<Record<string, number>>({});
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [supplementIntakes, setSupplementIntakes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!targetId) return;
    const load = async () => {
      setLoading(true);

      // Load nutrition logs for the day
      const { data: logs } = await supabase
        .from("nutrition_logs")
        .select("*")
        .eq("client_id", targetId)
        .eq("logged_at", today);

      // Aggregate micronutrients from food logs
      const foodIntakes: Record<string, number> = {};
      (logs || []).forEach((log: any) => {
        MICRONUTRIENTS.forEach((n) => {
          foodIntakes[n.key] = (foodIntakes[n.key] || 0) + (log[n.key] || 0);
        });
      });

      // Load supplement logs for the day
      const { data: suppLogs } = await supabase
        .from("supplement_logs")
        .select("servings, supplement_id, supplements(*)")
        .eq("client_id", targetId)
        .eq("logged_at", today);

      const suppIntakes: Record<string, number> = {};
      (suppLogs || []).forEach((sl: any) => {
        if (!sl.supplements) return;
        const s = sl.supplements;
        const servings = sl.servings || 1;
        MICRONUTRIENTS.forEach((n) => {
          suppIntakes[n.key] = (suppIntakes[n.key] || 0) + ((s[n.key] || 0) * servings);
        });
      });

      // Combine food + supplement intakes
      const total: Record<string, number> = {};
      MICRONUTRIENTS.forEach((n) => {
        total[n.key] = (foodIntakes[n.key] || 0) + (suppIntakes[n.key] || 0);
      });

      setIntakes(total);
      setSupplementIntakes(suppIntakes);

      // Load custom targets if available
      const { data: customTargets } = await supabase
        .from("micronutrient_targets")
        .select("*")
        .eq("client_id", targetId)
        .limit(1)
        .maybeSingle();

      if (customTargets) {
        const t: Record<string, number> = {};
        MICRONUTRIENTS.forEach((n) => {
          t[n.key] = customTargets[n.key as keyof typeof customTargets] as number || n.rda;
        });
        setTargets(t);
      }

      setLoading(false);
    };
    load();
  }, [targetId, today]);

  if (loading) {
    return <div className="animate-pulse space-y-4">
      {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-secondary rounded-lg" />)}
    </div>;
  }

  const adequacyScore = calculateAdequacyScore(intakes, Object.keys(targets).length > 0 ? targets : undefined);
  const deficiencies = getDeficiencies(intakes, Object.keys(targets).length > 0 ? targets : undefined);
  const overconsumption = getOverconsumption(intakes);

  const getBarColor = (pct: number, hasUpperLimit: boolean, intake: number, upperLimit?: number) => {
    if (hasUpperLimit && upperLimit && intake > upperLimit) return "bg-destructive";
    if (pct >= 80) return "bg-green-500";
    if (pct >= 50) return "bg-yellow-500";
    return "bg-destructive/70";
  };

  const renderNutrientRow = (n: NutrientInfo) => {
    const intake = intakes[n.key] || 0;
    const target = targets[n.key] ?? n.rda;
    const pct = target > 0 ? Math.round((intake / target) * 100) : 0;
    const suppAmount = supplementIntakes[n.key] || 0;
    const isOver = n.upperLimit && intake > n.upperLimit;

    return (
      <div key={n.key} className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{n.label}</span>
            {suppAmount > 0 && <Pill className="h-3 w-3 text-purple-400" />}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("tabular-nums", isOver ? "text-destructive" : "text-muted-foreground")}>
              {intake.toFixed(1)}/{target}{n.unit}
            </span>
            <span className={cn(
              "text-[10px] font-semibold w-10 text-right",
              pct >= 80 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-destructive"
            )}>
              {pct}%
            </span>
          </div>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", getBarColor(pct, !!n.upperLimit, intake, n.upperLimit))}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Adequacy Score */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-14 w-14 rounded-full flex items-center justify-center text-xl font-bold",
                adequacyScore >= 80 ? "bg-green-500/20 text-green-400" :
                adequacyScore >= 50 ? "bg-yellow-500/20 text-yellow-400" :
                "bg-destructive/20 text-destructive"
              )}>
                {adequacyScore}
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Micronutrient Score</h3>
                <p className="text-xs text-muted-foreground">
                  {adequacyScore >= 80 ? "Excellent coverage" :
                   adequacyScore >= 50 ? "Moderate — some gaps" :
                   "Poor — significant deficiencies"}
                </p>
              </div>
            </div>
            <div className="text-right space-y-1">
              {deficiencies.length > 0 && (
                <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 text-[10px]">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {deficiencies.length} low
                </Badge>
              )}
              {overconsumption.length > 0 && (
                <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {overconsumption.length} high
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {(deficiencies.length > 0 || overconsumption.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {deficiencies.map((n) => (
              <div key={n.key} className="flex items-center gap-2 text-xs">
                <TrendingDown className="h-3 w-3 text-yellow-400 shrink-0" />
                <span className="text-foreground">{n.label}</span>
                <span className="text-muted-foreground">
                  — {((intakes[n.key] || 0) / (targets[n.key] ?? n.rda) * 100).toFixed(0)}% of target
                </span>
              </div>
            ))}
            {overconsumption.map((n) => (
              <div key={n.key} className="flex items-center gap-2 text-xs">
                <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                <span className="text-foreground">{n.label}</span>
                <span className="text-muted-foreground">
                  — exceeds upper limit ({n.upperLimit}{n.unit})
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Nutrient Breakdown */}
      <Tabs defaultValue="vitamins">
        <TabsList className="w-full">
          <TabsTrigger value="vitamins" className="flex-1">Vitamins</TabsTrigger>
          <TabsTrigger value="minerals" className="flex-1">Minerals</TabsTrigger>
          <TabsTrigger value="fatty_acids" className="flex-1">Fatty Acids</TabsTrigger>
        </TabsList>

        <TabsContent value="vitamins">
          <Card>
            <CardContent className="pt-4 space-y-3">
              {MICRONUTRIENTS.filter((n) => n.category === "vitamin").map(renderNutrientRow)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="minerals">
          <Card>
            <CardContent className="pt-4 space-y-3">
              {MICRONUTRIENTS.filter((n) => n.category === "mineral").map(renderNutrientRow)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fatty_acids">
          <Card>
            <CardContent className="pt-4 space-y-3">
              {MICRONUTRIENTS.filter((n) => n.category === "fatty_acid").map(renderNutrientRow)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MicronutrientDashboard;
