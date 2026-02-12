import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, subDays } from "date-fns";

const ComplianceOverview = () => {
  const [data, setData] = useState<{ date: string; workouts: number; nutrition: number; checkins: number }[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), "yyyy-MM-dd"));

      const chartData = await Promise.all(
        days.map(async (day) => {
          const { count: workouts } = await supabase
            .from("workout_sessions")
            .select("id", { count: "exact", head: true })
            .gte("created_at", `${day}T00:00:00`)
            .lte("created_at", `${day}T23:59:59`)
            .not("completed_at", "is", null);

          const { count: nutrition } = await supabase
            .from("nutrition_logs")
            .select("id", { count: "exact", head: true })
            .eq("logged_at", day);

          const { count: checkins } = await supabase
            .from("weekly_checkins")
            .select("id", { count: "exact", head: true })
            .eq("week_date", day);

          return {
            date: format(new Date(day), "EEE"),
            workouts: workouts || 0,
            nutrition: nutrition || 0,
            checkins: checkins || 0,
          };
        })
      );

      setData(chartData);
    };
    fetch();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Platform Activity (Last 7 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="workouts" name="Workouts" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="nutrition" name="Nutrition Logs" fill="hsl(200 70% 55%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="checkins" name="Check-ins" fill="hsl(280 60% 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Loading activity data...</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ComplianceOverview;
