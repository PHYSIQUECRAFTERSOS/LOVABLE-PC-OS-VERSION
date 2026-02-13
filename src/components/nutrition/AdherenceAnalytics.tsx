import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { TrendingUp, Zap, Target, Flame, Award } from "lucide-react";

interface NutritionDay {
  date: string;
  calories: number;
  protein: number;
}

interface AdherenceStats {
  calorieAdherence: number;
  proteinAdherence: number;
  weeklyConsistency: number;
  longestStreak: number;
  currentStreak: number;
  totalDaysLogged: number;
  weeklyData: Array<{ week: string; calAdh: number; protAdh: number }>;
  dailyAdherence: Array<{ date: string; calories: number; protein: number; adherent: boolean }>;
}

const StatBadge = ({ icon: Icon, label, value, unit, color }: { icon: any; label: string; value: number; unit: string; color: string }) => (
  <div className="rounded-lg border border-border bg-card p-3">
    <div className="flex items-start gap-2">
      <div className="rounded-md p-2" style={{ backgroundColor: color + "20" }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}{unit}</p>
      </div>
    </div>
  </div>
);

const AdherenceAnalytics = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdherenceStats | null>(null);
  const [loading, setLoading] = useState(true);

  const calculateAdherence = async () => {
    if (!user) return;
    setLoading(true);

    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const today = format(new Date(), "yyyy-MM-dd");

    // Fetch nutrition targets
    const { data: targetData } = await supabase
      .from("nutrition_targets")
      .select("calories, protein")
      .eq("client_id", user.id)
      .lte("effective_date", today)
      .order("effective_date", { ascending: false })
      .limit(1);

    const targetCals = targetData?.[0]?.calories || 2000;
    const targetProtein = targetData?.[0]?.protein || 150;

    // Fetch nutrition logs
    const { data: logsData } = await supabase
      .from("nutrition_logs")
      .select("logged_at, calories, protein")
      .eq("client_id", user.id)
      .gte("logged_at", thirtyDaysAgo)
      .order("logged_at", { ascending: true });

    const logs = logsData || [];

    // Group by day
    const dailyData: Record<string, NutritionDay> = {};
    logs.forEach((log: any) => {
      if (!dailyData[log.logged_at]) {
        dailyData[log.logged_at] = { date: log.logged_at, calories: 0, protein: 0 };
      }
      dailyData[log.logged_at].calories += log.calories || 0;
      dailyData[log.logged_at].protein += log.protein || 0;
    });

    const sortedDays = Object.values(dailyData).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate adherence (±10% of target)
    const tolerance = 0.1;
    const dailyAdherence = sortedDays.map((day) => ({
      date: format(new Date(day.date), "MM/dd"),
      calories: day.calories,
      protein: day.protein,
      adherent: Math.abs(day.calories - targetCals) / targetCals <= tolerance && Math.abs(day.protein - targetProtein) / targetProtein <= tolerance,
    }));

    const adherentDays = dailyAdherence.filter((d) => d.adherent).length;
    const calorieAdherence = Math.round((adherentDays / sortedDays.length) * 100) || 0;

    // Protein adherence separately
    const proteinAdherentDays = sortedDays.filter((d) => Math.abs(d.protein - targetProtein) / targetProtein <= tolerance).length;
    const proteinAdherence = Math.round((proteinAdherentDays / sortedDays.length) * 100) || 0;

    // Calculate streaks
    let longestStreak = 0;
    let currentStreak = 0;
    let maxStreak = 0;

    for (const day of sortedDays) {
      const isAdherent = Math.abs(day.calories - targetCals) / targetCals <= tolerance && Math.abs(day.protein - targetProtein) / targetProtein <= tolerance;
      if (isAdherent) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    longestStreak = maxStreak;

    // Current streak (check from today backwards)
    currentStreak = 0;
    for (let i = sortedDays.length - 1; i >= 0; i--) {
      const day = sortedDays[i];
      const isAdherent = Math.abs(day.calories - targetCals) / targetCals <= tolerance && Math.abs(day.protein - targetProtein) / targetProtein <= tolerance;
      if (isAdherent) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Weekly breakdown
    const weeklyData: Record<string, { calAdh: number; protAdh: number; count: number }> = {};
    sortedDays.forEach((day) => {
      const weekStart = format(startOfWeek(new Date(day.date)), "MM/dd");
      if (!weeklyData[weekStart]) {
        weeklyData[weekStart] = { calAdh: 0, protAdh: 0, count: 0 };
      }
      const calAdherent = Math.abs(day.calories - targetCals) / targetCals <= tolerance ? 1 : 0;
      const protAdherent = Math.abs(day.protein - targetProtein) / targetProtein <= tolerance ? 1 : 0;
      weeklyData[weekStart].calAdh += calAdherent;
      weeklyData[weekStart].protAdh += protAdherent;
      weeklyData[weekStart].count++;
    });

    const weeklyChartData = Object.entries(weeklyData).map(([week, data]) => ({
      week,
      calAdh: Math.round((data.calAdh / data.count) * 100),
      protAdh: Math.round((data.protAdh / data.count) * 100),
    }));

    // Weekly consistency score (average across all days in past 4 weeks)
    const weeklyConsistency = Math.round(
      (sortedDays.filter((d) => Math.abs(d.calories - targetCals) / targetCals <= tolerance).length / sortedDays.length) * 100
    ) || 0;

    setStats({
      calorieAdherence,
      proteinAdherence,
      weeklyConsistency,
      longestStreak,
      currentStreak,
      totalDaysLogged: sortedDays.length,
      weeklyData: weeklyChartData,
      dailyAdherence,
    });

    setLoading(false);
  };

  useEffect(() => {
    calculateAdherence();
  }, [user]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const needsData = stats.totalDaysLogged < 3;

  if (needsData) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold text-foreground">Need More Data</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Log at least 3 days of nutrition data to see your adherence analytics and tracking streaks.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatBadge icon={Zap} label="Calorie Adherence" value={stats.calorieAdherence} unit="%" color="hsl(43 72% 55%)" />
        <StatBadge icon={Flame} label="Protein Adherence" value={stats.proteinAdherence} unit="%" color="hsl(0 84% 60%)" />
        <StatBadge icon={Target} label="Weekly Consistency" value={stats.weeklyConsistency} unit="%" color="hsl(180 80% 50%)" />
        <StatBadge icon={Award} label="Longest Streak" value={stats.longestStreak} unit=" days" color="hsl(120 60% 50%)" />
        <StatBadge icon={TrendingUp} label="Current Streak" value={stats.currentStreak} unit=" days" color="hsl(240 100% 50%)" />
      </div>

      {/* Weekly Adherence Chart */}
      {stats.weeklyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Weekly Adherence Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 16%)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 16%)", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="calAdh" fill="hsl(43 72% 55%)" name="Calorie Adherence" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="protAdh" fill="hsl(0 84% 60%)" name="Protein Adherence" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Adherence Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">30-Day Adherence Pattern</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="text-center text-xs text-muted-foreground mb-2 font-medium">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]}
              </div>
            ))}
            {stats.dailyAdherence.slice(-42).map((day, idx) => (
              <div
                key={idx}
                className={`h-8 rounded-sm border border-border flex items-center justify-center text-xs font-medium transition-colors ${
                  day.adherent
                    ? "bg-green-500/20 border-green-500/50 text-green-700"
                    : "bg-muted border-muted-foreground/20 text-muted-foreground"
                }`}
                title={`${day.date}: ${day.calories} cal, ${day.protein}g protein`}
              >
                {day.adherent ? "✓" : ""}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">✓ = Day met both calorie & protein targets (±10%)</p>
        </CardContent>
      </Card>

      {/* Adherence Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Goal Achievement Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "On Track", value: stats.calorieAdherence, fill: "hsl(120 60% 50%)" },
                    { name: "Off Track", value: 100 - stats.calorieAdherence, fill: "hsl(0 70% 55%)" },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {[0, 1].map((i) => (
                    <Cell key={i} fill={i === 0 ? "hsl(120 60% 50%)" : "hsl(0 70% 55%)"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 16%)", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-center text-sm">
            <p className="text-muted-foreground">
              You&apos;ve hit your targets on <span className="font-bold text-foreground">{stats.calorieAdherence}%</span> of logged days
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdherenceAnalytics;
