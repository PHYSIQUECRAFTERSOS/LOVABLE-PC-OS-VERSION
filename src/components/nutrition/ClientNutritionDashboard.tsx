import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { useTDEE } from "@/hooks/useTDEE";
import { calculateAdequacyScore, MICRONUTRIENTS } from "@/lib/micronutrients";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Flame, Target, TrendingDown, TrendingUp, Minus, Shield } from "lucide-react";

const ClientNutritionDashboard = () => {
  const { user } = useAuth();
  const { result: tdee, loading } = useTDEE();
  const [microScore, setMicroScore] = useState<number>(0);
  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (!user) return;
    const loadMicroScore = async () => {
      const { data } = await supabase
        .from("nutrition_logs")
        .select("*")
        .eq("client_id", user.id)
        .eq("logged_at", today);

      const intakes: Record<string, number> = {};
      (data || []).forEach((log: any) => {
        MICRONUTRIENTS.forEach((n) => {
          intakes[n.key] = (intakes[n.key] || 0) + (log[n.key] || 0);
        });
      });
      setMicroScore(calculateAdequacyScore(intakes));
    };
    loadMicroScore();
  }, [user, today]);

  if (loading || !tdee) return null;

  const rateIcon = tdee.weightChangeRate < -0.1 ? TrendingDown : tdee.weightChangeRate > 0.1 ? TrendingUp : Minus;
  const RateIcon = rateIcon;

  const microColor = microScore >= 80 ? "text-green-400" : microScore >= 50 ? "text-yellow-400" : "text-destructive";
  const microBg = microScore >= 80 ? "bg-green-500/10" : microScore >= 50 ? "bg-yellow-500/10" : "bg-destructive/10";
  const microLabel = microScore >= 80 ? "Excellent" : microScore >= 50 ? "Moderate" : "Needs work";

  const chartData = tdee.weightHistory.slice(-14).map((w) => ({
    date: format(new Date(w.date), "MM/dd"),
    weight: w.avg7 || w.weight,
  }));

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Flame className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground">{tdee.avgDailyCalories.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Avg Intake</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Target className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground">{tdee.adherencePct}%</p>
            <p className="text-[10px] text-muted-foreground">Adherence</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className={`p-3 text-center ${microBg} rounded-lg`}>
            <Shield className={`h-4 w-4 mx-auto ${microColor} mb-1`} />
            <p className={`text-lg font-bold ${microColor}`}>{microScore}</p>
            <p className="text-[10px] text-muted-foreground">{microLabel}</p>
          </CardContent>
        </Card>
      </div>

      {/* Weight Trend (Smoothed) */}
      {chartData.length > 2 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <RateIcon className="h-3.5 w-3.5" />
              Weight Trend
              <span className="ml-auto text-foreground font-semibold">
                {tdee.rollingAvg7 || tdee.avgWeight} lb
              </span>
            </p>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(0 0% 55%)" }} />
                  <YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} tick={{ fontSize: 9, fill: "hsl(0 0% 55%)" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 16%)", borderRadius: 8, color: "hsl(45 10% 90%)" }} />
                  <Line type="monotone" dataKey="weight" stroke="hsl(43 72% 55%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientNutritionDashboard;
